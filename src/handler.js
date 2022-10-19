import * as utils from "./utils/utils.js";
import * as fg from "./openwhisk/action_gestures.js";
import * as logger from "./log/logger.cjs";

export async function mergeSequence(req,res){

    logger.log("/api/v1/sequence/merge", "info");
    var funcs = [];

    if (!Object.keys(req.body).includes("name")) {
        res.json({"message":"Please provide sequence name"})
    }

    if(req.body.name === "" || req.body.name === undefined || req.body.name === null){
        res.json({"message":"Please provide valid sequence name"})
    }

    const sequenceName = req.body.name;
    const binaries_timestamp = Date.now();
    const period = req.body.period === undefined || req.body.period === null ? false:req.body.period;

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
}

export async function optimizeSequence(req,res){
    logger.log("/api/v1/action/optimize", "info");
    var funcs = [];

    if (!Object.keys(req.body).includes("name")) {
        res.json({"message":"Please provide sequence name"})
    }

    if(req.body.name === "" || req.body.name === undefined || req.body.name === null){
        res.json({"message":"Please provide valid sequence name"})
    }

    const sequenceName = req.body.name;
    const isWholeMerge = req.body.whole === undefined || req.body.whole === null ? false:req.body.whole;
    const period = req.body.period === undefined || req.body.period === null ? false:req.body.period;
    const binaries_timestamp = Date.now();

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

        utils.applyMergePolicies(resolvedfuncWithMetrics,sequenceMetrics,result.limits, async function (analized_funcs) {

            /**
             * CONTROLLO PER VERIFICARE SE IL MERGE SARA TOTALE O PARZIALE
             */

            if(isWholeMerge){
                const mergeOutcome = analized_funcs.map(t => {
                    return t.to_merge
                })
    
                var positive = 0;
                mergeOutcome.forEach(outcome =>{
                    if(outcome) positive++;
                })
    
                if(positive >= mergeOutcome.length){
    
                    await utils.merge(analized_funcs,sequenceName,true)
                    res.json("Sequence successfully merged!!")
                    return;
                }
            }else{
                
                /**
                 * se la lunghezza dell'array di merge creato è uguale al numero di funzioni della sequenza
                 * significa che nessuna funzione è passibile di fusione
                 */
                const new_configuration = utils.checkPartialMerges(analized_funcs,configuration);

                if( new_configuration.length === configuration.length){
                    res.json("Sequence doesn't need to be optimized, if you want you can use ' merge ' command to forcely optimize it")
                    return
                }

		/**
                 * SE LA NUOVA CONFIGURAZIONE HA LUNGHEZZA 1 SIGNIFICA CHE 
                 * VERRA CREATA UNA SINGOLA FUNZIONE EFFETTUANDO IL MERGE DI TUTTE 
                 */

                if( new_configuration.length == 1 ){

                    /**
                     * FUSIONE TOTALE
                     */
                    await utils.merge( new_configuration[0],sequenceName,true)
                    res.json("Sequence successfully merged!!")
                    return;

                }else{

                    /**
                     * FUSIONE PARZIALE 
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

                    const final_limit = fg.computeLimit(resolve_sub_seq_array_parsed);

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
            }
        })     
    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
}

export async function getMetrics(req,res){
    logger.log("/api/v1/metrics/get", "info");
    let p = req.body.period;
    if (p === null || p === undefined) p = "1d";
    const response = await fg.getMetricsByActionNameAndPeriod(req.body.name, p);

    response.duration = response.duration + " ms";
    response.waitTime = response.waitTime + " ms";
    response.initTime = response.initTime + " ms";
    res.json(response);
}

export async function getAction(req,res){
    logger.log("/api/v1/action/get", "info");

    fg.getAction(req.body.name).then((result)=>{
        res.json(result);
    });
}

export async function listActions(req,res){
    fg.listActionsCB(function(result){
        if(result.length < 1){
            res.json({"mex":"No actions found"})
        }else{
            res.json(result);
        }
    })
}

export async function invokeAction(req,res){
    logger.log("/api/v1/action/invoke", "info");
    var blocking = false;
    const params = req.body.params;
    if(Object.keys(req.body).includes("blocking")){
        if(req.body.blocking) blocking = true;
    }

    fg.invokeActionWithParams(req.body.name,params,blocking).then((result)=>{
        res.json(result);
    });
}

//17102022
export async function createActionTest(req,res){
    
    if(req.file !== null && req.file !== undefined){
        if(Buffer.byteLength(req.file.buffer)/1000000 > 35 ){
            res.json({"mex":"Artifact too big, can't create action"})
        }else{
            if(req.body.name === null || req.body.name === undefined || req.body.name == "" ){
                res.json({"mex":"Please provide a valid name to create the new action"})
            }
            if(req.body.kind === null || req.body.kind === undefined || req.body.kind == "" ){
                res.json({"mex":"Please provide a valid kind to create the new action"})
            }
            fg.createActionCB(req.body.name,req.file.buffer,req.body.kind,"binary",req.body.limits, function (result){
                res.json({"mex":"Action succesfully created","result":result})
            })
        }
    }else{
        if(req.body.name === null || req.body.name === undefined || req.body.name == "" ){
            res.json({"mex":"Please provide a valid name to create the new action"})
        }
        fg.createActionCB(req.body.name,req.file.buffer,req.body.kind,"binary",req.body.limits, function (result){
            res.json({"mex":"Action succesfully created","result":result})
        })
    } 
}

/**
 * TEST REWRITE FILE 
 */

//18102022
export async function optimizeSequenceTest(req,res){
    logger.log("/api/v1/action/optimize", "info");
    var funcs = [];

    if (!Object.keys(req.body).includes("name")) {
        res.json({"message":"Please provide sequence name"})
    }

    if(req.body.name === "" || req.body.name === undefined || req.body.name === null){
        res.json({"message":"Please provide valid sequence name"})
    }

    const sequenceName = req.body.name;
    const isWholeMerge = req.body.whole === undefined || req.body.whole === null ? false:req.body.whole;
    const period = req.body.period === undefined || req.body.period === null ? false:req.body.period;
    const binaries_timestamp = Date.now();

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
                    var parsed = fg.parseActionTest(result, timestamp,binaries_timestamp);
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

        utils.applyMergePolicies(resolvedfuncWithMetrics,sequenceMetrics,result.limits, async function (analized_funcs) {

            /**
             * CONTROLLO PER VERIFICARE SE IL MERGE SARA TOTALE O PARZIALE
             */

            if(isWholeMerge){
                const mergeOutcome = analized_funcs.map(t => {
                    return t.to_merge
                })
    
                var positive = 0;
                mergeOutcome.forEach(outcome =>{
                    if(outcome) positive++;
                })
    
                if(positive >= mergeOutcome.length){
    
                    await utils.mergeTest(analized_funcs,sequenceName,true)
                    res.json({"mex":"Sequence successfully merged!!"})
                    return;
                }else{
                    res.json({"mex":"Sequence can't be optimized!!"})
                    return;
                }
            }else{
                
                /**
                 * se la lunghezza dell'array di merge creato è uguale al numero di funzioni della sequenza
                 * significa che nessuna funzione è passibile di fusione
                 */
                const new_configuration = utils.checkPartialMerges(analized_funcs,configuration);

                if( new_configuration.length === configuration.length){
                    res.json("Sequence doesn't need to be optimized, if you want you can use ' merge ' command to forcely optimize it")
                    return
                }

		        /**
                 * SE LA NUOVA CONFIGURAZIONE HA LUNGHEZZA 1 SIGNIFICA CHE 
                 * VERRA CREATA UNA SINGOLA FUNZIONE EFFETTUANDO IL MERGE DI TUTTE 
                 */

                if( new_configuration.length == 1 ){

                    /**
                     * FUSIONE TOTALE
                     */
                    await utils.mergeTest( new_configuration[0],sequenceName,true)
                    res.json("Sequence successfully merged!!")
                    return;

                }else{

                    /**
                     * FUSIONE PARZIALE 
                     */

                    var prom = []
		            /**
                     * EFFETTUO IL MERGE DELLE SOTTO FUNZIONI
                     */
                    new_configuration.forEach(sub_seq => {
                        if(sub_seq.length > 1){
                            prom.push(
                                utils.mergeTest(sub_seq,sequenceName,false)
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

                    const final_limit = fg.computeLimit(resolve_sub_seq_array_parsed);

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
            }
        })     
    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
}
