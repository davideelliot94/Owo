import * as fg from "./openwhisk/action_gestures.js";
import * as logger from "./log/logger.cjs";
import * as kafka from "./kafka/Kafka.cjs";
import Metric from "./metrics/Metric.js";

export async function simulateSequence(req,res){
    logger.log("/api/v1/sequence/sim", "info");
    const sequenceName = req.body.seq;
    const optName = req.body.opt === undefined || req.body.opt === null || req.body.opt === "" ? null:req.body.opt;
    const period = req.body.period === undefined || req.body.period === null || req.body.period === "" ? null:req.body.period;
    const seqOnly = req.body.seqonly === undefined || req.body.seqonly === null ? false:req.body.seqonly;

    const message = await prepareSimulation(sequenceName,optName,period,seqOnly).catch((result) => res.json("An error occurred"))

    kafka.sendToKafka(message)

    //const simulation = kafka.receiveFromKafka();

    //logger.log(simulation)

    //res.json({"Simulation results":simulation});
    res.json({"Simulation":message});
}

export async function simulateOptimization(req,res){
    logger.log("/api/v1/sequence/sim", "info");
    const sequenceName = req.body.seq;
    var period = req.body.period === undefined || req.body.period === null || req.body.period === "" ? null:req.body.period;

    const message = await prepareOptimizationSimulation(sequenceName,period).catch((result) => res.json("An error occurred"))

    kafka.sendToKafka(message)

    //const simulation = kafka.receiveFromKafka();

    //logger.log(simulation)

    //res.json({"Simulation results":simulation});
    res.json({"Simulation":message});
}

export async function compareOptimization(req,res){
    logger.log("/api/v1/sequence/optimize/sim", "info");
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period
    }else{
        period = '1d'
    }

    if (Object.keys(req.body).includes("names")) {
        if(req.body.names.length <= 1) res.errored()
    }

    const pre = await fg.getAction(req.body.names[0]).catch((result) => res.json("An error occurred")) // necessariemanete una sequenza
    const post = await fg.getAction(req.body.names[1]).catch((result) => res.json("An error occurred")) // può essere una sequenza

  
    const preMetrics= await fg.getMetricsByActionNameAndPeriod(pre.name,period).catch((result) => res.json("An error occurred"));
    //const postMetrics = await fg.getMetricsByActionNameAndPeriod(post,period);

    if(!Object.keys(pre.exec).includes("components") ){
        res.json({"mex":"First action must be a sequence!"})

    }
    
    var preFunctions = pre.exec.components;
    let postFunctions = []

    if(Object.keys(post.exec).includes("components") ){
        postFunctions = post.exec.components;
    } else{
        postFunctions.push(req.body.names[1])
    }

    preFunctions = preFunctions.map(async f =>{
        const tmp = f.split("/")
        return await fg.getAction(tmp[tmp.length -1])
    })

    postFunctions = postFunctions.map(async f =>{
        const tmp = f.split("/")
        return await fg.getAction(tmp[tmp.length -1])
    })

    preFunctions = await Promise.all(preFunctions).catch((result) => res.json("An error occurred"))
    postFunctions = await Promise.all(postFunctions).catch((result) => res.json("An error occurred"))
        
    const messages = await prepareComparison(preFunctions,postFunctions,period,preMetrics,pre.limits).catch((result) => res.json("An error occurred"));
    kafka.sendToKafka(messages[0])
    kafka.sendToKafka(messages[1])

    res.json({"mex":[{"message":messages[0]},{"message":messages[1]}]})
}

/**
 * 
 * @param {string} sequenceName name of the provided sequence to simulate
 * @param {string} optSequenceName name of the optimized function
 * @param {string} p period  
 * @param {Boolean} seqonly if simulation will include actions primary invocations
 * @returns kafka message -> JSON object
 */
async function prepareSimulation(sequenceName,optSequenceName,p,seqonly){

    var period = p == null ? '1d':p
    const result = await fg.getAction(sequenceName);
    const condAction = await fg.getMetricsByActionNameAndPeriod(sequenceName,period)
    var funcs = [];

    if (Object.keys(result).includes("error")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    };

    if(!Object.keys(result).includes("exec")){
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    }

    let wOpt = false
    if(optSequenceName != null || optSequenceName != undefined){
        funcs.push({function:{"name":optSequenceName,"limits":{}},"metrics":{}});
        wOpt = true;
    }

    result.exec.components.forEach(element => {
        const tmp = element.split("/");
        funcs.push({function:{"name":tmp[tmp.length -1],"limits":{}},"metrics":{}});
    });

    const funcWithMetrics = funcs.map(async func => {

        if (period === null) period = '1d';
        const result = await fg.getAction(func.function.name);
        const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.function.name,period);
        func.metrics = metricsRaw;
        func.function.limits = result.limits
        return func;
    })

    const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics);

    const message = kafka.buildMessage(seqonly && wOpt ? [resolvedfuncWithMetrics[0]]:resolvedfuncWithMetrics,
                                        null,period,result.limits,condAction,seqonly)
    message.name = optSequenceName == null ? sequenceName + "_" + period:optSequenceName + "_" + period;

    return message;
}

/**
 * @param {string} sequenceName name of the provided sequence to simulate
 * @param {string} optSequenceName name of the optimized function
 * @param {string} p period  
 * @returns kafka message -> JSON object
 */
async function prepareOptimizationSimulation(sequenceName,p){

    var period = p == null ? '1d':p
    const result = await fg.getAction(sequenceName);
    const condAction = await fg.getMetricsByActionNameAndPeriod(sequenceName,period)
    var funcs = [];

    if (Object.keys(result).includes("error")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    };

    if(!Object.keys(result).includes("exec")){
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    }

    result.exec.components.forEach(element => {
        const tmp = element.split("/");
        funcs.push({function:{"name":tmp[tmp.length -1],"limits":{}},"metrics":{}});
    });

    const funcWithMetrics = funcs.map(async func => {

        if (period === null) period = '1d';
        const result = await fg.getAction(func.function.name);
        const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.function.name,period);
        func.metrics = metricsRaw;
        func.function.limits = result.limits
        return func;
    })

    const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics)

    let sumDuration = resolvedfuncWithMetrics.reduce((sumDuration,x) => sumDuration = sumDuration + x.metrics.duration)
    let sumInitTime = resolvedfuncWithMetrics.reduce((sumInitTime,x) => sumInitTime = sumInitTime + x.metrics.initTime)
    const avgColdStartDuration = (sumInitTime / resolvedfuncWithMetrics.length) || 0;
    let sumColdStartRate = resolvedfuncWithMetrics.reduce((sumColdStartRate,x) => sumColdStartRate = sumColdStartRate + (x.metrics.coldStarts/x.metrics.activations))
    const avgColdStartRate = (sumColdStartRate / resolvedfuncWithMetrics.length) || 0;

    const optLimit = fg.computeLimit(resolvedfuncWithMetrics)
    const optimizedFunc = {function:{   
                                "name":"optimizedFunc",
                                "limits":optLimit
                            },
                            "metrics":Metric(
                                                sumDuration,
                                                2,
                                                sumInitTime,
                                                condAction.activations,
                                                condAction.activations*avgColdStartRate,
                                                condAction.farrivalRate,
                                                avgColdStartDuration
                                            )
                        }

    funcs.push(optimizedFunc);
                      
    const message = kafka.buildMessage(resolvedfuncWithMetrics,null,period,result.limits,condAction,false)
    message.name = sequenceName + "_" + period;

    return message;
}

/**
 * 
 * @param {Array} pre all function in the cluster before the optimization
 * @param {Array} post all function in the cluster after the optimization
 * @param {string} p period
 * @param {JSON objects} preMetrics conductor action metrics
 * @param {limits} limits 
 * @returns 
 */
async function prepareComparison(pre,post,p,preMetrics,limits){

    var period = p == null ? '1d':p
    let postWithMetricsRaw = []
    const preWithMetricsRaw = pre.map(async p => {
    
        if (period === null) period = '1d';
        var func = {function:{"name":p.name,"limits":p.limits},"metrics":{}}

        const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.function.name,period);
        func.metrics = metricsRaw;
        return func;
    })

    const preWithMetrics = await Promise.all(preWithMetricsRaw)

    if(post.length > 1){
        postWithMetricsRaw = pre.map(async po => {
    
            if (period === null) period = '1d';
            var func = {function:{"name":po.name,"limits":po.limits},"metrics":{}}
    
            const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.name,period);
            func.metrics = metricsRaw;
            return func;
        })

    }else{
        if (period === null) period = '1d';
        var func = {function:{"name":post[0].name,"limits":post[0].limits},"metrics":{}}

        const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.function.name,period);
        func.metrics = metricsRaw;
        postWithMetricsRaw.push(func)
    }

    const postWithMetrics = await Promise.all(postWithMetricsRaw)

    const preMessage = kafka.buildMessage(preWithMetrics,null,period,limits,preMetrics,false);
    const postMessage = kafka.buildMessage(preWithMetrics,postWithMetrics,period,limits,preMetrics,false)
    preMessage.name = "pre_" + period
    postMessage.name = "post_" + period

    return [preMessage,postMessage]
}
