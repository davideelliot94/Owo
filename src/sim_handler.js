import * as fg from "./openwhisk/action_gestures.js";
import * as logger from "./log/logger.cjs";
import * as kafka from "./kafka/Kafka.cjs";
import Metric from "./metrics/Metric.js";
import * as conf from "../config/conf.cjs"

export async function simulateOptimization(req, res) {

    if(conf.SIMULATION_ENABLED){
        
        logger.log("api/v1/sequence/sim/opt", "info");
        if (!Object.keys(req.body).includes("name")) {
            res.json("Sequence name is required")
        }
        const sequenceName = req.body.name;
        var period = req.body.period === undefined || req.body.period === null || req.body.period === "" ? null : req.body.period;

        const message = await prepareOptimizationSimulation(sequenceName, period)
        //.catch((error) => res.json("An error occurred: " + error))

        const k = Date.now().toString()
        kafka.sendToKafka(message,k)
        await kafka.receiveFromComputeAndSend(k,res);    
    }else{
        res.json("Simulator is not enabled")
    }
}

/**
 * @param {string} sequenceName name of the provided sequence to simulate
 * @param {string} optSequenceName name of the optimized function
 * @param {string} p period  
 * @returns kafka message -> JSON object
 */
async function prepareOptimizationSimulation(sequenceName, p) {

    var period = p == null ? '1d' : p
    const result = await fg.getAction(sequenceName);
    const condAction = await fg.getMetricsByActionNameAndPeriod(sequenceName, period)
    var funcs = [];

    if (Object.keys(result).includes("error")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    };

    if (!Object.keys(result).includes("exec")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    }

    result.exec.components.forEach(element => {
        const tmp = element.split("/");
        funcs.push({"name":tmp[tmp.length - 1],"limits":"","metrics":""})
    });

    const funcWithMetrics = funcs.map(async func => {

        if (period === null) period = '1d';
        const result = await fg.getAction(func.name);
        const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.name, period);
        func.metrics = metricsRaw;
        func.limits = result.limits
        return func;
    })

    const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics)

    let sumDuration = resolvedfuncWithMetrics.reduce((sumDuration, x) => sumDuration = sumDuration + x.metrics.duration)
    let sumInitTime = resolvedfuncWithMetrics.reduce((sumInitTime, x) => sumInitTime = sumInitTime + x.metrics.initTime)
    const avgColdStartDuration = (sumInitTime / resolvedfuncWithMetrics.length) || 0;
    let sumColdStartRate = resolvedfuncWithMetrics.reduce((sumColdStartRate, x) => sumColdStartRate = sumColdStartRate + (x.metrics.coldStarts / x.metrics.activations))
    const avgColdStartRate = (sumColdStartRate / resolvedfuncWithMetrics.length) || 0;

    const optLimit = fg.computeLimit(resolvedfuncWithMetrics)
    const toSendFunc = resolvedfuncWithMetrics.map((f)=>{
        return {"function":{"name":f.name,"limits":f.limits},"metrics":f.metrics}
    })
    const optimizedFunc = {
        "function": {
            "name": "optimizedFunc",
            "limits": optLimit
        },
        "metrics": new Metric(
            sumDuration,
            2,
            sumInitTime,
            condAction.activations,
            condAction.activations * avgColdStartRate,
            condAction.farrivalRate,
            avgColdStartDuration
        )
    }

    const message = kafka.buildMessageSimulationOptimization(toSendFunc, [optimizedFunc], period,result.limits, condAction)
    message.name = sequenceName + "_" + period;
    return message;
}
