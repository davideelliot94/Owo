import * as utils from "./utils/utils.js";
import * as fg from "./openwhisk/action_gestures.js";
import * as logger from "./log/logger.cjs";
import Limit from "./metrics/Limit.js";

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

    const result = await fg.getAction(sequenceName).catch((result) => res.json("An error occurred"));
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

        const merged = await utils.merge(funcs,sequenceName,binaries_timestamp,true).catch((result) => res.json("An error occurred"));
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

    const result = await fg.getAction(sequenceName).catch((result) => res.json("An error occurred"));
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
    const seqLen = result.exec.components.length
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
        const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics).catch((result)=> res.json("An error occurred"));
        const sequenceMetrics = await fg.getMetricsByActionNameAndPeriod(sequenceName,period).catch((result)=>{ res.json("an error occurred")});

        utils.applyMergePolicies(resolvedfuncWithMetrics,sequenceMetrics,seqLen,isWholeMerge, async function (isToMerge,analized_funcs) {

            /**
             * CONTROLLO PER VERIFICARE SE IL MERGE SARA TOTALE O PARZIALE
             */
            if(!isToMerge){
                res.json("Sequence doesn't need to be optimized");
                return;
            }else{
                if(isWholeMerge){
                
                    await utils.merge(analized_funcs,sequenceName,binaries_timestamp,true).catch((result) => res.json("An error occurred"))
                    res.json("Sequence successfully merged!!")
                    return;
    
                }else{

                    const new_configuration = utils.checkPartialMerges(analized_funcs,configuration);
    
                    /**
                     * SE LA NUOVA CONFIGURAZIONE HA LUNGHEZZA 1 SIGNIFICA CHE 
                     * VERRA CREATA UNA SINGOLA FUNZIONE EFFETTUANDO IL MERGE DI TUTTE 
                     */
    
                    if( new_configuration.length == 1 ){
    
                        /**
                         * FUSIONE TOTALE
                         */
                        await utils.merge( new_configuration[0],sequenceName,binaries_timestamp,true).catch((result) => { res.json("an error occurred ")})
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
                                    // questa è da controllare per il binary timestamp
                                    utils.merge(sub_seq,sequenceName,binaries_timestamp,false).catch((result) => { res.json("an error occurred ")})
                                )
                            }else{
                                prom.push(sub_seq[0])
                            }
                        });
    
                        const resolve_sub_seq_array_parsed = await Promise.all(prom).catch((result) =>{ res.json("An error occurred")});
    
                        /**
                         * 
                         * CALCOLO I LIMITS PER LA FUNZIONE FINALE CHE VERRÀ CREATA
                         * 
                         * da ricontrollare, perchè se creo una sequenza non ce n'è bisogno
                         */
    
                        //const final_limit = fg.computeLimit(resolve_sub_seq_array_parsed);
                        const final_limit = new Limit(conf.LIMITS.limits.concurreny,
                                                        conf.LIMITS.limits.logs,
                                                        conf.LIMITS.limits.memory,
                                                        conf.LIMITS.limits.timeout)
    
                        var seq_names_array = [];
                        seq_names_array.push("/_/" + resolve_sub_seq_array_parsed[0].name);
    
                        /**
                         * ottengo i nomi dei "components", della sequenza 
                         */
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
            }
        })     
    })
    .catch(err => {
        logger.log(err, "WARN")
        res.json(err);
    }); 
}

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

    const result = await fg.getAction(sequenceName).catch((result) => res.json("An error occurred"));
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
    const seqLen = result.exec.components.length
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
        const resolvedfuncWithMetrics = await Promise.all(funcWithMetrics).catch((result)=> res.json("An error occurred"));
        const sequenceMetrics = await fg.getMetricsByActionNameAndPeriod(sequenceName,period).catch((result)=>{ res.json("an error occurred")});

        utils.applyMergePolicies2(resolvedfuncWithMetrics,sequenceMetrics,seqLen,isWholeMerge, async function (isToMerge,analized_funcs,needs_partial) {

            /**
             * CONTROLLO PER VERIFICARE SE IL MERGE SARA TOTALE O PARZIALE
             */
            if(!isToMerge){
                res.json("Sequence doesn't need to be optimized");
                return;
            }else{
                if(isWholeMerge){
                
                    await utils.merge(analized_funcs,sequenceName,binaries_timestamp,true).catch((result) => res.json("An error occurred"))
                    res.json("Sequence successfully merged!!")
                    return;
    
                }else{

    
                    /**
                     * SE È NECESSARIO UN MERGE PAZIALE 
                     */
    
                    if(!needs_partial){
    
                        /**
                         * FUSIONE TOTALE
                         */
                        await utils.merge( analized_funcs,sequenceName,binaries_timestamp,true).catch((result) => { res.json("an error occurred ")})
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
                        analized_funcs.forEach(sub_seq => {
                            if(sub_seq.length > 1){
                                prom.push(
                                    // questa è da controllare per il binary timestamp
                                    /**
                                     * È SICURAMENTE SBAGLIATO, PERCHÈ HO TUTTO DENTRO UNA SOLA CARTELLA E DEVO FARE PIU FUNZIONI
                                     * 
                                     * MODI PER RISOLVERE:
                                     *  - INSERIRE LA FILE LIST DENTRO OGNI ACTION PER POTERLI REPERIRE DALLA CARTELLA,
                                     *  - NON SALVARE MAI NULLA MA LAVORARE DIRETTAMENTE CON I BASE64 O CON IL CODICE E SOLO QUI CREARE I NUOVI ARTEFATTI 
                                     *      -> PUÒ ESSERE UN PROBLEMA A LIVELLO DI CONTROLLO -> IN QUESTO MOMENTO FERMO IL MERGE PRIMA CONTROLLANDO LA GRANDEZZA DEL CODICE
                                     * 
                                     * NB: RIMANE IL PROBLEMA DEI NODE MODULES CHE RIMARREBBERO COMUNQUE TUTTI AMMUCCHIATI 
                                     *    OSS: IL PROBLEMA NON SI PONE SE PER ESEMPIO HO DUE PYTHON PERCHÈ NON HANNO QUESTA GESTIONE DELLE DIPENDENCIES
                                     */
                                    utils.merge(sub_seq,sequenceName,binaries_timestamp,false)
                                )
                            }else{
                                prom.push(sub_seq[0])
                            }
                        });
    
                        const resolve_sub_seq_array_parsed = await Promise.all(prom).catch((result) =>{ res.json("An error occurred")});
    
                        /**
                         * 
                         * CALCOLO I LIMITS PER LA FUNZIONE FINALE CHE VERRÀ CREATA
                         * 
                         * da ricontrollare, perchè se creo una sequenza non ce n'è bisogno
                         */
    
                        //const final_limit = fg.computeLimit(resolve_sub_seq_array_parsed);
                        const final_limit = new Limit(conf.LIMITS.limits.concurreny,
                                                        conf.LIMITS.limits.logs,
                                                        conf.LIMITS.limits.memory,
                                                        conf.LIMITS.limits.timeout)
    
                        var seq_names_array = [];
                        seq_names_array.push("/_/" + resolve_sub_seq_array_parsed[0].name);
    
                        /**
                         * ottengo i nomi dei "components", della sequenza 
                         */
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
    const response = await fg.getMetricsByActionNameAndPeriod(req.body.name, p).catch((result) => res.json("An error occurred"));

    response.duration = response.duration + " ms";
    response.waitTime = response.waitTime + " ms";
    response.initTime = response.initTime + " ms";
    res.json(response);
}

