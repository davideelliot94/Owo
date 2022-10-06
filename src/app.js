import express from 'express';
import * as utils from "./utils/utils.js";
import * as fg from "./openwhisk/action_gestures.js";
import * as logger from "./log/logger.cjs";
import * as kafka from "./kafka/Kafka.cjs";

const app = express();
app.use(express.json());

/**
 * ------------------------------------------------------
 * 
 *  
 *                       ROUTES 
 * 
 * 
 * ------------------------------------------------------
 *  */

app.get("/", (req, res) => {
    res.json({ "response": "Service up and running!" });
});

/**
 * 
 *  MERGE
 * 
 *
 */

app.post("/api/v1/sequence/merge", async (req, res) => {

    logger.log("/api/v1/sequence/merge", "info");
    var funcs = [];
    const sequenceName = req.body.name;
    const binaries_timestamp = Date.now();
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period;
    }

    const result = await fg.getAction(sequenceName);
    var promises = [];

    //CONTROLLO ERRORI
    if (Object.keys(result).includes("error")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    };

    //CONTROLLO SULL'OTTENUIMENTO DELLA SEQUENZA
    if(!Object.keys(result).includes("exec")){
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    }

    //CONTROLLO SE LA ACTION E EFFETTIVAMENTE UNA SEQUENZA
    if(!Object.keys(result.exec).includes("components")){
        res.json("Seems like the provided function is not a sequence");
        return;
    }
    

    result.exec.components.forEach(funcName => {

        var tmp = funcName.split('/');
        promises.push(

            fg.getAction(tmp[tmp.length - 1])
                .then((result) => {

                    if (Object.keys(result.exec).includes("components")) {
                        return 0;
                    }

                    const timestamp = Date.now();
                    var parsed = fg.parseAction(result, timestamp,binaries_timestamp);
                    return parsed;

                }).catch((error) => {
                    logger.log(error, "error");
                    res.json(error);
                    return -1;
                })
        );
    });

    Promise.all(promises).then((result) => {
        result.forEach((r) => {
            funcs.push(r)
        })
    }).then(async () => {

        /**
         * CONTROLLO LA PRESENZA DI SOTTOSEQUENZE
         */

        let sub_seq_detected = false;
        let i = 0;
        for (i; i < funcs.length - 1; i++) {
            if (funcs[i] == 0) {
                sub_seq_detected = true;
                break;
            }
        }

        if (sub_seq_detected) {
            logger.log("Sub-sequence detected", "info")
            res.json({ mex: "Sub-sequence detected, atm is not possible to optimize sequence containing other sequences!" })
            return;
        }

        const merged = await utils.merge(funcs,sequenceName,true);
        res.json({"mex":"Sequence successfully merged!!",
                  "outcome":merged})
        return;

    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
});

/**
 * 
 * OPTIMIZE 
 * 
 * */

app.post("/api/v1/sequence/optimize", async (req, res) => {

    logger.log("/api/v1/sequence/optimize", "info");
    var funcs = [];
    const sequenceName = req.body.name;
    const binaries_timestamp = Date.now();
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period;
    }

    const result = await fg.getAction(sequenceName);
    var promises = [];

    //CONTROLLO ERRORI
    if (Object.keys(result).includes("error")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    };

    //CONTROLLO SULL'OTTENUIMENTO DELLA SEQUENZA
    if(!Object.keys(result).includes("exec")){
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    }

    //CONTROLLO SE LA ACTION E EFFETTIVAMENTE UNA SEQUENZA
    if(!Object.keys(result.exec).includes("components")){
        res.json("Seems like the provided function is not a sequence");
        return;
    }
    

    result.exec.components.forEach(funcName => {

        var tmp = funcName.split('/');
        promises.push(

            fg.getAction(tmp[tmp.length - 1])
                .then((result) => {

                    if (Object.keys(result.exec).includes("components")) {
                        return 0;
                    }

                    const timestamp = Date.now();
                    var parsed = fg.parseAction(result, timestamp,binaries_timestamp);
                    return parsed;

                }).catch((error) => {
                    logger.log(error, "error");
                    res.json(error);
                    return -1;
                })
        );
    });

    Promise.all(promises).then((result) => {
        result.forEach((r) => {
            funcs.push(r)
        })
    }).then(async () => {

        /**
         * CONTROLLO LA PRESENZA DI SOTTOSEQUENZE
         */

        let sub_seq_detected = false;
        let i = 0;
        for (i; i < funcs.length - 1; i++) {
            if (funcs[i] == 0) {
                sub_seq_detected = true;
                break;
            }
        }

        if (sub_seq_detected) {
            logger.log("Sub-sequence detected", "info")
            res.json({ mex: "Sub-sequence detected, atm is not possible to optimize sequence containing other sequences!" })
            return;
        }

        const funcWithMetrics = funcs.map(async func => {

            if (period === null) period = '1d';
            const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.name,period);
            func.metrics = metricsRaw;
            return func;

        })
        const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics);
        const sequenceMetrics = await fg.getMetricsByActionNameAndPeriod(sequenceName,period);

        utils.applyMergePoliciesNew(resolvedfuncWithMetrics,sequenceMetrics,result.limits, async function (tmp_to_merge) {

            /**
             * CONTROLLO PER VERIFICARE SE IL MERGE SARA TOTALE O PARZIALE
             */

            const sub_seq_array = utils.checkPartialMerges(tmp_to_merge);
            

            /**
             * se la lunghezza dell'array di merge creato è uguale al numero di funzioni della sequenza
             * significa che nessuna funzione è passibile di fusione
             */
            if(sub_seq_array.length === tmp_to_merge.length){
                res.json("Sequence doesn't need to be optimized, if you want you can use ' merge ' command to forcely optimize it")
                return
            }

            if(sub_seq_array.length == 1){

                /**
                 * FUSIONE TOTALE
                 */
                await utils.merge(sub_seq_array[0],sequenceName,true)
                res.json("Sequence successfully merged!!")
                return;

            }else{

                /**
                 * FUSIONE PARZIALE 
                 */
                var prom = []
                sub_seq_array.forEach(sub_seq => {
                    if(sub_seq.length > 1){
                        prom.push(
                            utils.merge(sub_seq,sequenceName,false)
                        )
                    }else{
                        prom.push(sub_seq[0])
                    }
                });

                const resolve_sub_seq_array_parsed = await Promise.all(prom);

                const final_limit = fg.computeLimit(resolve_sub_seq_array_parsed)

                var seq_names_array = [];
                seq_names_array.push("/_/" + resolve_sub_seq_array_parsed[0].name);

                for (let l = 1; l < resolve_sub_seq_array_parsed.length -1; l++) {
                    seq_names_array.push("/_/" + resolve_sub_seq_array_parsed[l][0])
                }

                fg.deleteActionCB(sequenceName, function (data) {
                    //CREA LA NUOVA SEQUENZA
                    fg.createActionCB(sequenceName, seq_names_array,"sequence", "sequence", final_limit,function (last_result) {
                        res.json({ "mex": "Functions partially merged","composition":last_result});
                    });
                })

            }  
        })     
    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
});

app.post("/api/v1/sequence/optimize/norepeat", async (req, res) => {

    logger.log("/api/v1/action/optimize/norepeat", "info");
    var funcs = [];
    const sequenceName = req.body.name;
    const binaries_timestamp = Date.now();
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period;
    }

    const result = await fg.getAction(sequenceName);
    var promises = [];

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

    if(!Object.keys(result.exec).includes("components")){
        res.json("Seems like the provided function is not a sequence");
        return;
    }

    /**
     * 
     * SE NELLA CATENA È RICHIAMATA PIU VOLTE LA STESSA FUNZIONE, 
     * NE FACCIO IL PARSING UNA SOLA VOLTA
     */

    let noDuplicatesFunctions = [...new Set(result.exec.components)];

    let configuration = result.exec.components.map(entry =>{
        var tmp = entry.split('/');
        return tmp[tmp.length - 1]
    })

    noDuplicatesFunctions.forEach(funcName => {

        var tmp = funcName.split('/');
        const nameNoNamespace = tmp[tmp.length - 1]
        promises.push(

            fg.getAction(nameNoNamespace)
                .then((result) => {

                    if (Object.keys(result.exec).includes("components")) {
                        return 0;
                    }

                    const timestamp = Date.now();
                    var parsed = fg.parseActionNoRepeat(result, timestamp,binaries_timestamp,configuration);
                    return parsed;

                }).catch((error) => {
                    logger.log(error, "error");
                    res.json(error);
                    return -1;
                })
        );
    });

    Promise.all(promises).then((result) => {
        result.forEach((r) => {
            funcs.push(r)
        })
    }).then(async () => {

        /**
         * 
         * CONTROLLO SE CI SONO SOTTOSEQUENZE, IN TAL CASO NON POSSO OTTIMIZZARE
         */

        let sub_seq_detected = false;
        let i = 0;
        for (i; i < funcs.length - 1; i++) {
            if (funcs[i] == 0) {
                sub_seq_detected = true; 
                break;
            }
        }

        if (sub_seq_detected) {
            logger.log("Sub-sequence detected", "info")
            res.json({ mex: "Sub-sequence detected, atm is not possible to optimize sequence containing other sequences!" })
            return;
        }

        /**
         * 
         * OTTENGO LE METRICHE PER OGNI FUNZIONE
         */

        const funcWithMetrics = funcs.map(async func => {

            if (period === null) period = '1d';
            const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.name,period);
            func.metrics = metricsRaw;
            return func;

        })
        const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics);
        const sequenceMetrics = await fg.getMetricsByActionNameAndPeriod(sequenceName,period);


        utils.applyMergePoliciesNew(resolvedfuncWithMetrics,sequenceMetrics,result.limits, async function (analized_funcs) {

            /**
             * CONTROLLO PER VERIFICARE SE IL MERGE SARA TOTALE O PARZIALE
             */

            const new_configuration = utils.checkPartialMergesNew(analized_funcs,configuration);

            if( new_configuration.length === configuration.length){
                res.json("Sequence doesn't need to be optimized, if you want you can use ' merge ' command to forcely optimize it")
                return
            }

            /**
             * SE LA NUOVA CONFIGURAZIONE HA LUNGHEZZA 1 SIGNIFICA CHE 
             * VERRA CREATA UNA SINGOLA FUNZIONE EFFETTUANDO IL MERGE DI TUTTE 
             */

            if( new_configuration.length == 1 ){
                await utils.merge( new_configuration[0],sequenceName,true)
                res.json("Sequence successfully merged!!")
                return;
            }else{

                /**
                 * SE LA NUOVA CONFIGURAZIONE HA LUNGHEZZA > 11 SIGNIFICA CHE 
                 * VERRA CREATA UNA NUOVA SEQUENZA DI FUNZIONI FRUTTO DI FUSIONE PARZIALE 
                 */

                var prom = []
                /**
                 * EFFETTUO IL MERGE DELLE SOTTO FUNZIONI
                 */
                 new_configuration.forEach(sub_seq => {
                    if(sub_seq.length > 1){
                        prom.push(
                            utils.merge(sub_seq,sequenceName,false)
                        )
                    }else{
                        prom.push(sub_seq[0])
                    }
                });

                const resolve_sub_seq_array_parsed = await Promise.all(prom);

                /**
                 * 
                 * CALCOLO I LIMITS PER LA FUNZIONE FINALE CHE VERRÀ CREATA
                 */

                var final_limit = fg.computeLimit(resolve_sub_seq_array_parsed);

                var seq_names_array = [];
                seq_names_array.push("/_/" + resolve_sub_seq_array_parsed[0].name);

                for (let l = 1; l < resolve_sub_seq_array_parsed.length -1; l++) {

                    seq_names_array.push("/_/" + resolve_sub_seq_array_parsed[l][0])
                }

                fg.deleteActionCB(sequenceName, function (data) {
                    //CREA LA NUOVA SEQUENZA
                    fg.createActionCB(sequenceName, seq_names_array,"sequence", "sequence", final_limit,function (last_result) {
                        res.json({ "mex": "Functions partially merged","composition":last_result});
                    });
                })
            }  
        })     
    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
});

app.post("/api/v1/sequence/optimize/whole", async (req, res) => {

    logger.log("/api/v1/action/optimize/whole", "info");
    var funcs = [];
    const sequenceName = req.body.name;
    const binaries_timestamp = Date.now();
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period;
    }

    const result = await fg.getAction(sequenceName);
    var promises = [];

    //CONTROLLO ERRORI
    if (Object.keys(result).includes("error")) {
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    };

    //CONTROLLO SULL'OTTENUIMENTO DELLA SEQUENZA
    if(!Object.keys(result).includes("exec")){
        logger.log("Error getting sequence: " + sequenceName, "warn");
        logger.log(JSON.stringify(result), "warn");
        res.json(result);
        return;
    }

    //CONTROLLO SE LA ACTION E EFFETTIVAMENTE UNA SEQUENZA
    if(!Object.keys(result.exec).includes("components")){
        res.json("Seems like the provided function is not a sequence");
        return;
    }
    

    result.exec.components.forEach(funcName => {

        var tmp = funcName.split('/');
        promises.push(

            fg.getAction(tmp[tmp.length - 1])
                .then((result) => {

                    if (Object.keys(result.exec).includes("components")) {
                        return 0;
                    }

                    const timestamp = Date.now();
                    var parsed = fg.parseAction(result, timestamp,binaries_timestamp);
                    return parsed;

                }).catch((error) => {
                    logger.log(error, "error");
                    res.json(error);
                    return -1;
                })
        );
    });

    Promise.all(promises).then((result) => {
        result.forEach((r) => {
            //funcs.push({ "function": r, "metrics": {}, "to_merge": false })
            funcs.push(r)

        })
    }).then(async () => {

        /**
         * CONTROLLO LA PRESENZA DI SOTTOSEQUENZE
         */

        let sub_seq_detected = false;
        let i = 0;
        for (i; i < funcs.length - 1; i++) {
            if (funcs[i] == 0) {
                sub_seq_detected = true;
                break;
            }
        }

        if (sub_seq_detected) {
            logger.log("Sub-sequence detected", "info")
            res.json({ mex: "Sub-sequence detected, atm is not possible to optimize sequence containing other sequences!" })
            return;
        }

        const funcWithMetrics = funcs.map(async func => {

            if (period === null) period = '1d';
            const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.name,period);
            func.metrics = metricsRaw;
            return func;

        })
        const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics);
        const sequenceMetrics = await fg.getMetricsByActionNameAndPeriod(sequenceName,period);

        utils.applyMergePoliciesNew(resolvedfuncWithMetrics,sequenceMetrics,result.limits, async function (tmp_to_merge) {

            const mergeOutcome = tmp_to_merge.map(t => {
                return t.to_merge
            })

            var positive = 0;
            mergeOutcome.forEach(outcome =>{
                if(outcome) positive++;
            })

            if(positive >= mergeOutcome.length){
                /**
                 * 
                 * FUSIONE TOTALE
                 */
                await utils.merge(tmp_to_merge,sequenceName,true)
                res.json("Sequence successfully merged!!")
                return;
            }
        })     
    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
});

/** 
 * 
 * SIMULATION 
 * 
 * */

app.post("/api/v1/sequence/sim",async (req,res)=>{

    logger.log("/api/v1/sequence/sim", "info");
    const sequenceName = req.body.name;
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period 
    }

    const message = await prepareSimulation(sequenceName,period)

    kafka.sendToKafka(message)

    //const simulation = kafka.receiveFromKafka();

    //logger.log(simulation)

    //res.json({"Simulation results":simulation});
    res.json({"Simulation":message});
});

app.post("/api/v1/sequence/optimize/sim",async (req,res)=>{


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

    const pre = await fg.getAction(req.body.names[0]) // necessariemanete una sequenza
    const post = await fg.getAction(req.body.names[1]) // può essere una sequenza

  
    const preMetrics= await fg.getMetricsByActionNameAndPeriod(pre.name,period);
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

    preFunctions = await Promise.all(preFunctions)
    postFunctions = await Promise.all(postFunctions)
        
    const messages = await prepareComparison(preFunctions,postFunctions,period,preMetrics,pre.limits);
    kafka.sendToKafka(messages[0])
    kafka.sendToKafka(messages[1])

    res.json({"mex":[{"message":messages[0]},{"message":messages[1]}]})
});

app.post("/api/v1/sequence/optimize/sim/receive",async (req,res)=>{

    logger.log("/api/v1/sequence/optimize/sim/new", "info");
    var period = null;

    if (Object.keys(req.body).includes("period")) {
        period = req.body.period
    }else{
        period = '1d'
    }

    if (Object.keys(req.body).includes("names")) {
        if(req.body.names.length <= 1) res.errored()
    }

    const pre = await fg.getAction(req.body.names[0]) // necessariemanete una sequenza
    const post = await fg.getAction(req.body.names[1]) // può essere una sequenza

    const preMetrics= await fg.getMetricsByActionNameAndPeriod(pre.name,period);
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

    preFunctions = await Promise.all(preFunctions)
    postFunctions = await Promise.all(postFunctions)
        
    const messages = await prepareComparison(preFunctions,postFunctions,period,preMetrics,pre.limits);
    kafka.sendToKafka(messages[0])
    kafka.sendToKafka(messages[1])

    const simulation = await kafka.receiveFromKafka();

    logger.log(simulation)

    res.json({"Simulation results":simulation});
});

/** 
 * 
 * BASICS 
 * 
 * */

app.get("/api/v1/action/list", (req, res) => {

    fg.listActionsCB(function(result){
        if(result.length < 1){
            res.json({"mex":"No actions found"})
        }else{
            res.json(result);

        }
    })

});

app.post("/api/v1/action/invoke", async (req, res) => {

    var blocking = false;
    const params = req.body.params;
    if(Object.keys(req.body).includes("blocking")){
        if(req.body.blocking) blocking = true;
    }

    fg.invokeActionWithParams(req.body.name,params,blocking).then((result)=>{
        res.json(result);
    });
});

app.post("/api/v1/action/get", (req, res) => {

    logger.log("/api/v1/action/get", "info");

    fg.getAction(req.body.name).then((result)=>{
        res.json(result);
    });
});

// e la create??? 
// per la create devo anche vedere se mi mandano un file!!!

app.post("/api/v1/metrics/get", async (req, res) => {

    logger.log("/api/v1/metrics/get", "info");
    let p = req.body.period;
    if (p === null || p === undefined) p = "1d";
    const response = await fg.getMetricsByActionNameAndPeriod(req.body.name, p);

    response.duration = response.duration + " ms";
    response.waitTime = response.waitTime + " ms";
    response.initTime = response.initTime + " ms";
    res.json(response);

});

/**
 * UTILITY FUNCTIONS
 */

async function prepareSimulation(sequenceName,optSequenceName,p){

    var period = p == null ? '1d':p
    const result = await fg.getAction(sequenceName);
    const condAction = fg.getMetricsByActionNameAndPeriod(sequenceName,period)
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

    if(optSequenceName != null || optSequenceName != undefined){
        funcs.push({function:{"name":optSequenceName,"limits":{}},"metrics":{}});
    }

    result.exec.components.forEach(element => {
        const tmp = element.split("/");
        funcs.push({function:{"name":tmp[tmp.length -1],"limits":{}},"metrics":{}});
    });

    const funcWithMetrics = funcs.map(async func => {

        if (period === null) period = '1d';
        const result = await fg.getAction(func.function.name);
        const metricsRaw = await fg.getMetricsByActionNameAndPeriod(func.name,period);
        func.metrics = metricsRaw;
        func.function.limits = result.limits
        return func;
    })

    const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics);

    const message = kafka.buildMessage(resolvedfuncWithMetrics,null,period,result.limits,condAction,false)
    message.name = sequenceName + "_" + period

    return message;
}

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

    const preWithMetrics = await Promise.all(preWithMetricsRaw);

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

    const postWithMetrics = await Promise.all(postWithMetricsRaw);

    const preMessage = kafka.buildMessage(preWithMetrics,null,period,limits,preMetrics,false);
    const postMessage = kafka.buildMessage(preWithMetrics,postWithMetrics,period,limits,preMetrics,false)
    preMessage.name = "pre_" + period
    postMessage.name = "post_" + period

    return [preMessage,postMessage]
}

export default app;