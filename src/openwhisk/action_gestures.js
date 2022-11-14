import * as conf from '../../config/conf.cjs';
import * as fs from 'fs';
import path from "path";
import * as logger from "../log/logger.cjs";
import fetch from 'node-fetch';
import * as utils from "../utils/utils.js";
import * as zipgest from "../utils/zip_gestures.cjs"
import Metric from "../metrics/Metric.js"
import Limits from "../metrics/Limit.js"
import Action from "./entity/Action.js"
import { rejects } from 'assert';

const httpsAgent = conf.HTTPS_AGENT;

const __dirname = path.resolve();


/**
 * 
 * @param {string} funcName name of the function to create
 * @param {string} funcBody snippet of code/ base64 artifact / list of action names
 * @param {string} fkind kind of function to create -> binary,sequence,plain_text
 * @param {string} action_type kind of merge -> binary, not binary
 * @param {Limits} limits function limits
 * @param {function} callback 
 * @returns 
 */

/**
 * GESTIONE DEL NAMESPACE?
 */
function createActionCB(funcName,funcBody,fkind,action_type,limits,callback){

    if(action_type === "binary"){

        //MERGE DI TIPO BINARIO
        try {
            (async () => {
                const rawResponse = await fetch('https://'+conf.API_HOST+'/api/v1/namespaces/_/actions/'+funcName+'?overwrite=true', {
                  method: 'PUT',
                  headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization':'Basic '+ btoa(conf.API_KEY)
                  },
                  agent: httpsAgent,
                  body: JSON.stringify({"namespace":"_","name":funcName,
                                        "exec":{"kind":fkind,"code":funcBody,"binary":"true"},
                                        "annotations":[{"key":"web-export","value":true},{"key":"raw-http","value":false},{"key":"final","value":true}],
                                        "limits":limits.getJSON()})
                }).catch(err =>{
                    logger.log(err,"warn");
                });
                const content = await rawResponse.json();
                
                logger.log("/api/v1/action/create "+ JSON.stringify(content),"info");
                callback(content);
                
              })()
        } catch (error) {
            logger.log(error,"error");
            return error;

        }
    }else{
        if(fkind == "sequence"){
    
            try {
                (async () => {
                    const rawResponse = await fetch('https://'+conf.API_HOST+'/api/v1/namespaces/_/actions/'+funcName+'?overwrite=true', {
                    method: 'PUT',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization':'Basic '+ btoa(conf.API_KEY)
                    },
                    agent: httpsAgent,
                    body: JSON.stringify({"namespace":"_","name":funcName,
                                          "exec":{"kind":fkind,"components":funcBody},
                                          "annotations":[{"key":"web-export","value":true},{"key":"raw-http","value":false},{"key":"final","value":true}],
                                          "limits":limits.getJSON()})
                    });
                    const content = await rawResponse.json();
                    
                    logger.log("/api/v1/action/create "+ JSON.stringify(content),"info");
                    callback(content);
                    
                })()
            } catch (error) {
                logger.log(error,"error");
                return error;
            }
        }else{
            try {
                (async () => {
                    const rawResponse = await fetch('https://'+conf.API_HOST+'/api/v1/namespaces/_/actions/'+funcName+'?overwrite=true', {
                      method: 'PUT',
                      headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization':'Basic '+ btoa(conf.API_KEY)
                      },
                      agent: httpsAgent,
                      body: JSON.stringify({"namespace":"_","name":funcName,
                                            "exec":{"kind":fkind,"code":funcBody},
                                            "annotations":[{"key":"web-export","value":true},{"key":"raw-http","value":false},{"key":"final","value":true}],
                                            "limits":limits.getJSON()})
                    });
                    const content = await rawResponse.json();
                    
                    logger.log("/api/v1/action/create "+ JSON.stringify(content),"info");
                    callback(content);
                    
                })()
            } catch (error) {
                logger.log(error,"error");
                return error;
            } 
        }
    }
}

/**
 * 
 * @param {string} funcName name of the function to create
 * @param {string} funcBody snippet of code/ base64 artifact
 * @param {Limits} limits function limits
 * @param {string} dockerImg docker img name
 * @param {function} callback 
 * @returns 
 */
function createDockerActionCB(funcName,funcBody,limits,dockerImg,callback){

    try {
        (async () => {
            const rawResponse = await fetch('https://'+conf.API_HOST+'/api/v1/namespaces/_/actions/'+funcName+'?overwrite=true', {
              method: 'PUT',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization':'Basic '+ btoa(conf.API_KEY)
              },
              agent: httpsAgent,
              body: JSON.stringify({"namespace":"_","name":funcName,
                                    "exec":{"kind":"blackbox","image":dockerImg,"code":funcBody,"binary":"true"},
                                    "annotations":[{"key":"web-export","value":true},{"key":"raw-http","value":false},{"key":"final","value":true}],
                                    "limits":limits.getJSON()})
            }).catch(err =>{
                logger.log(err,"warn");
            });
            const content = await rawResponse.json();
            logger.log("/api/v1/action/create "+ JSON.stringify(content),"info");
            callback(content);
            
          })()
    } catch (error) {
        logger.log(error,"error");
        return error;
    }
}

/**
 * 
 * @param {string} funcName name of the function to delete
 * @param {function} callback 
 * @returns 
 */
function deleteActionCB(funcName,callback){

    try {
        fetch('https://'+conf.API_HOST+'/api/v1/namespaces/_/actions/'+funcName,{
        method: 'DELETE',
        headers: {
            'Authorization':'Basic '+ btoa(conf.API_KEY)
        },
        agent: httpsAgent
      })
        .then(response => response.json())
        .then(data => {  
            logger.log("/api/v1/action/delete " + JSON.stringify(data),"info");
            callback(data);
        }).catch(err =>{
            logger.log(err,"WARN");
            callback(error)
        });
    } catch (error) {  
        logger.log(error,"ERROR");
        callback(error)
    }
}

/**
 * 
 * @param {string} funcName name of the function to get
 * @returns JSON object representing an Action
 */

async function getAction(funcName){ 

    logger.log("Getting action "+funcName,"info");   
    try {
        const response = await fetch('https://'+conf.API_HOST+'/api/v1/namespaces/_/actions/'+funcName+'?blocking=true',{
        method: 'GET',
        headers: {
            'Authorization':'Basic '+ btoa(conf.API_KEY)
        },
        agent: httpsAgent
      });

        const data =  response.json();
        return data;
    } catch (error) {
        logger.log(error,"ERROR");
        return error;
    }
    
}

/**
 * 
 * @param {JSON object} element function to parse
 * @param {timestamp} timestamp 
 * @param {timestamp} binaries_timestamp 
 * @param {*} configuration 
 * @returns Action class 
 */
async function parseAction(element,timestamp,binaries_timestamp){

    logger.log("Parsing function","info");

    if(element.exec.binary) {

        let buff = Buffer.from(element.exec.code,'base64');

        const dirPath = path.join(__dirname ,"src/utils/zip_workdir/zipped/") + timestamp;
        const zipPath = path.join(__dirname , "src/utils/zip_workdir/zipped/") + timestamp + '/func.zip';
       

        // get size

        
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(zipPath, buff);
        const codeSize = zipgest.getFileSize(zipPath);
        await zipgest.extractZipLocal(timestamp);

        var kind = element.exec.kind;

        
        if(kind.includes("nodejs")){
            var packRaw = utils.getPackageInfoBinaryNode(timestamp)
            var pack = JSON.parse(packRaw);



            var func = utils.getMainFileBinary(timestamp,pack.main); 

            const binaries = path.join(__dirname,"src/utils/binaries/");
            fs.mkdirSync(binaries+ binaries_timestamp, { recursive: true });

            //ROUTINE PER LEGGERE IL CONTENUTO DI TUTTI I FILE 
            //utils.copyAllFiles("/src/utils/zip_workdir/extracted/"+timestamp,"/src/utils/binaries/"+binaries_timestamp,pack.main)
            const file_list =utils.copyAllFiles("/src/utils/zip_workdir/extracted/"+timestamp,"/src/utils/binaries/"+binaries_timestamp,pack.main)

            zipgest.cleanDirs("/zip_workdir/extracted/"+timestamp);


            let main_func;
            let main_func_invocation

            if (func.indexOf("exports.main") === -1){
                main_func = "main"
                main_func_invocation = func.substring(func.indexOf(main_func))
            }else{
                const last_line = (func.substring(func.indexOf("exports.main"),func.length))
                main_func = last_line.substring(last_line.indexOf("=")+1,last_line.indexOf(";")).trim()
                main_func_invocation = func.substring(func.indexOf(main_func))
            }
            

            

            //devo aggiungere una variabile a "invokation" per evitare duplicati nelle funzioni con stesso nome 

            var limit = new Limits(
                                element.limits.concurrency,
                                element.limits.logs,
                                element.limits.memory,
                                element.limits.timeout        
                                )  

            const action = new Action(
                                element.name,
                                func.replace(" "+main_func+"("," "+element.name +timestamp+"("),
                                element.name +timestamp+"(",
                                main_func_invocation.substring(main_func_invocation.indexOf(main_func+"(")+main_func.length + 1,main_func_invocation.indexOf(")")),
                                true,
                                (pack.dependencies === undefined || pack.dependencies === null )? "" :pack.dependencies,
                                kind,
                                false,
                                limit,
                                null,
                                codeSize
                            )

            if(action.code.includes("async ") || action.code.includes(" Promise") || action.code.includes(".then(")){
                action.asynch = true;
            }

            
            if(file_list.length > 0){
                file_list.forEach(lf=>{

                tmp.code = tmp.code.replace(lf.split("-")[0]+lf.split("-")[1],lf)
                })
            }
            
            

            return action;

        }


        if(kind.includes("python")){

            //VA SCOMMENTATA TUTTA QUESTA ROBA
            //QUANDO SO CHE LE ROUTINE VANNO


            var func = utils.getMainFileBinary(timestamp,"__main__.py"); 

            const binaries = path.join(__dirname,"src/utils/binaries/");
            fs.mkdirSync(binaries+ binaries_timestamp, { recursive: true });

            //ROUTINE PER LEGGERE IL CONTENUTO DI TUTTI I FILE
            const file_list = utils.copyAllFiles("/src/utils/zip_workdir/extracted/"+timestamp+"/","/src/utils/binaries/"+binaries_timestamp+"/","__main__.py")
            zipgest.cleanDirs("/zip_workdir/extracted/"+timestamp);


            let main_func;
/*
            if (func.indexOf("main") === -1){
                main_func = "main"
            }else{
                main_func = "main"
            }*/

            main_func = "main"

            
            var limit = new Limits(
                                element.limits.concurrency,
                                element.limits.logs,
                                element.limits.memory,
                                element.limits.timeout        
                                )

            const action = new Action(
                                element.name,
                                func.replace(" "+main_func+"("," "+element.name +timestamp+"("),
                                element.name + timestamp+"(",
                                func.substring(func.indexOf(main_func+"(") +main_func.length+ 1, func.indexOf(")")),
                                true,
                                null,
                                kind,
                                false,
                                limit,
                                null,
                                codeSize
                            )

            
            /*if(file_list.length > 0){
                file_list.forEach(lf=>{
                    tmp.code = tmp.code.replace(" "+lf.split("-")[0]+" "," "+lf+" ")
                })
            }*/

            if(file_list.length > 0){
                file_list.forEach(lf=>{

                tmp.code = tmp.code.replace(lf.split("-")[0]+lf.split("-")[1],lf)
                })
            }
            

            if(action.code.includes("async ") || action.code.includes(" await ")){
                action.asynch = true;
            }
            
            return action;

        }     
     
    }else {
        logger.log("Not binary function","info");
        var func = element.exec.code
        const codeSize = Buffer.byteLength(func, "utf-8");
        var kind = utils.detectLangSimple(func);

        if(kind.includes("nodejs")){

            let main_func;
            let main_func_invocation

            if (func.indexOf("exports.main") === -1){
                main_func = "main";
                main_func_invocation = func.substring(func.indexOf(main_func))

            }else{
                const last_line = (func.substring(func.indexOf("exports.main"),func.length))
                main_func = last_line.substring(last_line.indexOf("=")+1,last_line.indexOf(";")).trim()
                main_func_invocation = func.substring(func.indexOf(main_func))
            }

            var limit = new Limits(
                element.limits.concurrency,
                element.limits.logs,
                element.limits.memory,
                element.limits.timeout        
                )

            var func = element.exec.code;
            const action = new Action(
                                element.name,
                                func.replace(" "+main_func+"("," "+element.name +timestamp+"("),
                                element.name +timestamp+ "(",
                                main_func_invocation.substring(main_func_invocation.indexOf(main_func+"(")+main_func.length + 1,main_func_invocation.indexOf(")")),
                                false,
                                null,
                                kind,
                                false,
                                limit,
                                null,
                                codeSize
                            )


            if(action.code.includes("async ") || action.code.includes(" Promise") || action.code.includes(".then(")){
                action.asynch = true;
            }

            return action;
        }

        //devo controllare come funziona per il main se python
        if(kind.includes("python")){
/*
            let main_func;

            if (func.indexOf("main") === -1){
                // boh lo devo cercare
                main_func = "main"
            }else{
                main_func = "main"
            }*/

            const main_func = "main";

            const main_func_invocation = func.substring(func.indexOf(main_func));

            
            var limit = new Limits(
                                element.limits.concurrency,
                                element.limits.logs,
                                element.limits.memory,
                                element.limits.timeout        
                                )
            var func = element.exec.code;
            const action = new Action(
                                element.name,
                                func.replace(" "+main_func+"("," "+element.name +timestamp+"("),
                                element.name +timestamp+ "(",
                                main_func_invocation.substring(main_func_invocation.indexOf(main_func+"(")+main_func.length + 1,main_func_invocation.indexOf(")")),
                                false,
                                null,
                                kind,
                                false,
                                limit,
                                null,
                                codeSize
                            )
           
            if(action.code.includes("async ") || action.code.includes(" await ")){
                action.asynch = true;
            }

            return action;
        } 
    }
}

/**
 * 
 * @param {string} fname name of the function for which the metrics are retrieved
 * @param {string} period time interval for which the metrics are retrieved 
 * @returns Metrics class containing all metrics about a function
 */

async function getMetricsByActionNameAndPeriod(fname,period){ 

    const metrics = conf.METRICS;

    let p = 0;

    if(period.includes("d")){
        p = period.substring(0, period.length -1)*24*60*60
    }
    if(period.includes("h")){
        p = period.substring(0, period.length -1)*60*60
    }
    if(period.includes("m")){
        p = period.substring(0, period.length -1)*60
    }
    if(period.includes("s")){
        p = period.substring(0, period.length -1)
    }   

    const metricsRaw = metrics.map( async (metric)=>{
        var url = metric.url;
        url = url.replaceAll("$__action",fname);
        url = url.replaceAll("$__range",period)
        try {
            const rawResponse = await fetch(url,{
                method: 'GET',
                headers: {
                    'Authorization':'Basic '+ btoa(conf.API_KEY)
                }
            }).catch(err =>{
                logger.log(err,"WARN");
                return -1;
            });

            if(rawResponse == -1) return rawResponse;
            const res =  await rawResponse.json();
            var json =  { [metric.name]: "key attribute"}

            if(!Object.keys(res).includes("data")){
                return -1;
            }else{
                if(res.data.result.length < 1){
                    json[metric.name] = 0;
                    return json
                }else{
                    json[metric.name] = Number.parseFloat(res.data.result[0].value[1]).toFixed(9)
                    return json
                }
            }      
        } catch (error) {
            logger.log(error,"error")
        }                  
    })

    const metrics_collect_raw = await Promise.all(metricsRaw)
    var metrics_collect = {}
    metrics_collect_raw.forEach(metric => {
        if(metric == -1) return -1
        metrics_collect = Object.assign(metrics_collect,metric);
    })


    const duration = metrics_collect.duration * 1000;
    const waitTime = metrics_collect.waitTime * 1000;
    const initTime = metrics_collect.initTime * 1000;
    const activations = metrics_collect.status ;
    const coldStarts = metrics_collect.coldStarts;
    const arrivalRate = activations/p;

    const coldStartsDuration = initTime
    var response = new Metric(duration,waitTime,initTime,activations,coldStarts,arrivalRate,coldStartsDuration);
    
    logger.log("Retrieved duration,waitTime,initTime,activations,coldStarts metrics for action : " +fname,"info");
    logger.log(JSON.stringify(response),"info");
    return response;
    
}

/**
 * 
 * @param {array of JSON objects} functionsArray 
 * @returns JSON object containing the final limit of the merged action
 */

function computeLimit(functionsArray){

    logger.log("Computing limit for merged action","info")

    var final_limit =  functionsArray[0].limits;

    var seq_names_array = [];
    seq_names_array.push("/_/" +  functionsArray[0].name);

    for (let l = 1; l <  functionsArray.length ; l++) {
        const limit =  functionsArray[l].limits;

        seq_names_array.push("/_/" +  functionsArray[l][0])
        final_limit.concurrency = final_limit.concurrency >= limit.concurrency ? 
        final_limit.concurrency:limit.concurrency

        final_limit.logs = final_limit.logs >= limit.logs ? 
        final_limit.logs:limit.logs;

        final_limit.memory = final_limit.memory + limit.memory >= conf.LIMITS.limits.memory ? conf.LIMITS.limits.memory :final_limit.memory + limit.memory;
        //final_limit.memory = limit.memory > final_limit.memory ? limit.memory:final_limit.memory;

        final_limit.timeout = final_limit.timeout >= limit.timeout ? 
        final_limit.timeout:limit.timeout;   
    }

    console.log(final_limit)
    return final_limit;
}


export {
        getAction,
        deleteActionCB,
        parseAction,
        createActionCB,
        getMetricsByActionNameAndPeriod,
        computeLimit,
        createDockerActionCB
    };