import * as logger from "../log/logger.cjs";
import * as fs from 'fs';
import path from "path";
import os from 'os';
import child_process from "child_process";
import conf from "../../config/conf.cjs";
import * as fg from "../openwhisk/action_gestures.js";
import * as zipgest from "./zip_gestures.cjs";

const __dirname = path.resolve();

/**
 * 
 * @param {Array of Action classes} functions_to_merge 
 * @param {String} seq_name 
 * @param {Boolean} whole  true -> merge full, false -> partial merge
 * @returns 
 */
async function merge(functions_to_merge,seq_name,binaries_timestamp,mem_policy,whole){
    return new Promise(function(resolve, reject) {

        if(!whole) seq_name = seq_name+"-part"+Date.now();

        var sameLangCounter = 0;
        const prevKind = functions_to_merge[0].kind;
        var merged_seq_limits = fg.computeLimit(functions_to_merge,mem_policy);
        var binary_count = functions_to_merge[0].binary ? 1:0;

        if(functions_to_merge.length <=1){
            resolve( [seq_name,merged_seq_limits,result,functions_to_merge[0]]);
        }                               

        for (let index = 1; index < functions_to_merge.length; index++) {

            //COUNTER PER DETERMINARE SE TUTTE LE ACTION HANNO LO STESSO LINGUAGGIO     
            if (functions_to_merge[index].kind.split(":")[0] === prevKind.split(":")[0]) {
                sameLangCounter++;
            }
            //COUNTER PER DETERMINARE SE E QUANTE FUNZIONI BINARIE CI SONO
            if (functions_to_merge[index].binary) {
                binary_count++;
            }
        }

        var funcs = functions_to_merge;

        if (sameLangCounter == funcs.length -1) { 

            // le functions hanno tutte le stessa Kind (linguaggio) posso fonderle come plain text
            if (binary_count > 0) {
                // almeno una binaria 
                mergeFuncsBinarySameLangCB(funcs, seq_name,binaries_timestamp, function (timestamp_folder) {
                    zipgest.zipDirLocalCB(timestamp_folder, (file) => {
                        if(whole){
                            fg.deleteActionCB(seq_name, function (data) {
                                fg.createActionCB(seq_name, file, prevKind,"binary",merged_seq_limits, function (result) {
                                    if(Object.keys(result).includes("error")){
                                        reject(result)
                                    }
                                    let dirsplit = timestamp_folder.split("/")
                                    let dirname = "/"+dirsplit[dirsplit.length-3]+"/"+dirsplit[dirsplit.length-2]                              
                                    zipgest.cleanDirs(dirname);
                                    resolve( [seq_name,merged_seq_limits,result]);
                                });
                            })
                        }else{
                            fg.createActionCB(seq_name, file, prevKind,"binary",merged_seq_limits, function (result) {
                                if(Object.keys(result).includes("error")){
                                    reject(result)
                                }
                                let dirsplit = timestamp_folder.split("/")
                                let dirname = "/"+dirsplit[dirsplit.length-3] +"/"+dirsplit[dirsplit.length-2]+"/"+dirsplit[dirsplit.length-1]
                                zipgest.cleanDirs(dirname);
                                zipgest.cleanDirs(dirname + ".zip");
                                resolve( [seq_name,merged_seq_limits,result]);
                            });
                        }
                    })
                })
            } else {
                // solo plain text
                mergePlainTextFuncs(funcs, function (wrappedFunc) {
                    if(whole){
                        fg.deleteActionCB(seq_name, function (data) {
                            fg.createActionCB(seq_name, wrappedFunc, prevKind,"plain",merged_seq_limits, function (result) {
                                if(Object.keys(result).includes("error")){
                                    reject(result)
                                }
                                resolve( [seq_name,merged_seq_limits,result]);
                            });
                        });
                    }else{
                        fg.createActionCB(seq_name, wrappedFunc, prevKind,"plain",merged_seq_limits, function (result) {
                            if(Object.keys(result).includes("error")){
                                reject(result)
                            }
                            resolve( [seq_name,merged_seq_limits,result]);
                        });  
                    }         
                });
            }        
        } else {
            mergeDiffLangActions(funcs, seq_name,binaries_timestamp, function (timestamp_folder,docker_img) {
                zipgest.zipDirLocalCB(timestamp_folder, (file) => {
                    if(whole){
                        fg.deleteActionCB(seq_name, function (data) {
                            fg.createDockerActionCB(seq_name, file,merged_seq_limits,docker_img, function (result) {
                                if(Object.keys(result).includes("error")){
                                    reject(result)
                                }
                                let dirsplit = timestamp_folder.split("/")
                                let dirname ="/"+ dirsplit[dirsplit.length-3]+"/"+dirsplit[dirsplit.length-2]                              
                                zipgest.cleanDirs(dirname);
                                resolve( [seq_name,merged_seq_limits,result]);
                            });
                        })
                    }else{
                        fg.createDockerActionCB(seq_name, file,merged_seq_limits,docker_img, function (result) {    
                            if(Object.keys(result).includes("error")){
                                reject(result)
                            }
                            let dirsplit = timestamp_folder.split("/")
                            let dirname = "/"+dirsplit[dirsplit.length-3] +"/"+dirsplit[dirsplit.length-2]+"/"+dirsplit[dirsplit.length-1]  
                            zipgest.cleanDirs(dirname);
                            zipgest.cleanDirs(dirname + ".zip");
                            resolve( [seq_name,merged_seq_limits,result]);
                        });  
                    }                                   
                })
            });        
        }
    });
} 

/**
 * 
 * @param {Array of Action classes} funcs 
 * @param {String} seqName 
 * @param {String} binaries_timestamp 
 * @param {*} callback 
 */
function mergeFuncsBinarySameLangCB(funcs,seqName,binaries_timestamp,callback){


    /**
     * SUPPORTED LANGS:
        -NODEJS
        -PYTHON
    */

    let dir_path = ""
    logger.log("Merging same lang actions to binary","info");
    const fkind = funcs[0].kind;
    if(fkind.includes("nodejs")){
        //IF NODEJS

        var imports = "";
        var dependecies = {}
        var param = funcs[0].param;
        const binaries = path.join(__dirname,"src/utils/binaries/");
        
        //FOR LOOP PER SEGNARE TUTTI GLI IMPORT
        var nasync = 0
        funcs.forEach(f => {
            if(f.asynch){
                nasync++
            }
            if(f.binary){
                var lines = f.code.split(os.EOL);
                var new_code = ""
                lines.forEach(line => {
                    if(line.includes("import ") || line.includes("require(")){
                        // la riga contiene un import

                        /**
                         * 
                         * E SE UNO USA I REQUIRE E IMPORT INSIEME??
                         */
                        
                        imports = imports.concat(line).concat("\n");

                    }else{
                        if(!line.includes("exports.main")){
                            new_code = new_code.concat(line).concat("\n");
                        }
                        
                    }
                    
                })
                //recupero le corrette dipendenze
                if(f.dependecies != "") Object.assign(dependecies,f.dependecies);
                f.code = new_code;
            }
            
        });

        const importArray = imports.split(os.EOL);
        var uniqImports = [...new Set(importArray)];
        var importsString = "";
        if(uniqImports.length > 0){
            uniqImports.forEach(imp =>{
                importsString = importsString.concat(imp+"\n")
            })
        }
        var wrappedFunc = nasync  > 0 ? importsString.concat("async function main("+param+") {\n"):importsString.concat("function main("+param+") {\n");
        
        const prevFuncs = []
        funcs.forEach(f => {
            if(!prevFuncs.includes(f.name)) wrappedFunc = wrappedFunc.concat(f.code).concat("\n");
            prevFuncs.push(f.name)   
        });
        

        funcs.forEach((f,i) => {
            if(i == funcs.length -1){
                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("return await ").concat(f.invocation).concat(param+");\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("return ").concat(f.invocation).concat(param+");\n");
                }
            }
            else{
                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("var "+f.name+"Res"+i+" = await ").concat(f.invocation).concat(param+");\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("var "+f.name+"Res"+i+" = ").concat(f.invocation).concat(param+");\n");
                }
    
                param = f.name+"Res"+i;
                
            }
        });
        wrappedFunc = wrappedFunc.concat("}").concat("exports.main = main;\n");

        let buff = Buffer.from(wrappedFunc, 'utf8');
        var pjraw = {
            "name": seqName,
            "version": "1.0.0",
            "description": "An action written as an npm package.",
            "main": "index.js",
            "author": "FaaS-Optimizer",
            "license": "Apache-2.0",
            "dependencies": dependecies
        };
        let pj = Buffer.from(JSON.stringify(pjraw),"utf8");

        //mkdir binaries + binariest_timestamp + timestamp
        // per ogni func copio i file nella cartella 
        const dir_stamp = Date.now()
        dir_path = binaries+ binaries_timestamp +"/"+dir_stamp ;
        fs.mkdirSync(dir_path)
        funcs.forEach((f) => {
            f.file_list.forEach((file)=>{
                child_process.execSync("cp "+binaries+ binaries_timestamp +"/"+file+ " "+dir_path+"/"+file)
            })
        })
        
        fs.writeFileSync(dir_path + '/package.json', pj,{encoding: "utf8"});
        fs.writeFileSync(dir_path+ '/index.js', buff,{encoding: "utf8"});

    }
    if(fkind.includes("python")){
        //IF PYTHON
    

        var imports = "";
        var param = funcs[0].param;
        const binaries = path.join(__dirname,"src/utils/binaries/");
        //fs.mkdirSync(binaries+ timestamp, { recursive: true });
        
        //FOR LOOP PER SEGNARE TUTTI GLI IMPORT
        var nasync = 0

        funcs.forEach(f => {
            if(f.asynch){
                nasync++
            }
            if(f.binary){
                var lines = f.code.split(os.EOL);
                var new_code = ""
                lines.forEach(line => {
                    if(line.includes("import ")){
                        // la riga contiene un import
                        
                        imports = imports.concat(line).concat("\n");
                    }else{
                        new_code = new_code.concat(line+"\n")                                   
                    }
                    
                })
                f.code = new_code;
            }
            
        });

        const importArray = imports.split(os.EOL);
        var uniqImports = [...new Set(importArray)];
        var importsString = "";
        if(uniqImports.length > 0){
            uniqImports.forEach(imp =>{
                importsString = importsString.concat(imp+"\n")
            })
        }
        var wrappedFunc = nasync  > 0 ? importsString.concat("async def main("+param+"):\n"):importsString.concat("def main("+param+"):\n");
        
        const prevFuncs = []
        funcs.forEach(f => {
            if(!prevFuncs.includes(f.name)){
                var parsed_code = "";
                var flines = f.code.split(os.EOL);
                flines.forEach( line => {
                    parsed_code = parsed_code.concat("\t").concat(line).concat("\n")
                })
                wrappedFunc = wrappedFunc.concat(parsed_code);
            }       
            prevFuncs.push(f.name);
        });
        

        funcs.forEach((f,i) => {
            if(i == funcs.length -1){

                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("\treturn await ").concat(f.invocation).concat(param+")\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("\treturn ").concat(f.invocation).concat(param+")\n");
                }       
            }
            else{

                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("\t"+f.name+"Res"+i+" = await ").concat(f.invocation).concat(param+")\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("\t"+f.name+"Res"+i+" = ").concat(f.invocation).concat(param+")\n");
                }
                
                //wrappedFunc = wrappedFunc.concat("\t"+f.name+"Res = ").concat(f.invocation).concat(param+")\n");
                param = f.name+"Res"+i;
                
            }
        });

        let buff = Buffer.from(wrappedFunc, 'utf8');

        const dir_stamp = Date.now()
        dir_path = binaries+ binaries_timestamp +"/"+dir_stamp ;
        fs.mkdirSync(dir_path)
        funcs.forEach((f) => {
            f.file_list.forEach((file)=>{
                child_process.execSync("cp "+binaries+ binaries_timestamp +"/"+file+ " "+dir_path+"/"+file)
            })
        })
        fs.writeFileSync(dir_path+'/__main__.py', buff,{encoding: "utf8"});

        //CICLO PER SCRIVERE TUTTI GLI ALTRI FILES SE CE NE SONO

    }    
    callback(dir_path);

}
/**
 * 
 * @param {*} funcs 
 * @param {*} callback 
 */
function mergePlainTextFuncs(funcs,callback){

    const kind = funcs[0].kind;

    if(kind.includes("nodejs")){
        logger.log("Merging nodejs actions","info");
        var param = funcs[0].param;
        var wrappedFunc = "function main("+param+") {";
        var nasync = 0
        const prevFuncs = []
        funcs.forEach(f => {

            if(f.asynch){
                nasync++
            }
            if(!prevFuncs.includes(f.name)) wrappedFunc = wrappedFunc.concat(f.code);
            prevFuncs.push(f.name)
        });

        if(nasync > 0){
            wrappedFunc = "async ".concat(wrappedFunc)
        }

        funcs.forEach((f,i) => {
            if(i == funcs.length -1){
                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("return await ").concat(f.invocation).concat(param+");\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("return ").concat(f.invocation).concat(param+");\n");
                }         
            }
            else{
                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("var "+f.name+"Res"+i+" = await ").concat(f.invocation).concat(param+");\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("var "+f.name+"Res"+i+" = ").concat(f.invocation).concat(param+");\n");
                }
                param = f.name+"Res"+i;
            }     
        });
        wrappedFunc = wrappedFunc.concat("}").concat(os.EOL);
        callback(wrappedFunc);
    }

    if(kind.includes("python")){

        logger.log("Merging python actions","info");
        var param = funcs[0].param;
        var wrappedFunc = "def main("+param+"):";
        const prevFuncs = []

        funcs.forEach(f => {
            //wrappedFunc = wrappedFunc.concat("\n\t").concat(f.code);

            if(!prevFuncs.includes(f.name)){
                wrappedFunc = wrappedFunc.concat("\n");
                var codeArray = f.code.split(os.EOL);
                codeArray.forEach(line => {
                    wrappedFunc = wrappedFunc.concat("\t").concat(line).concat("\n");
                });   
            }
            prevFuncs.push(f.name)             
        });

        
        funcs.forEach((f,i) => {
            if(i == funcs.length -1){
                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("\n\treturn await ").concat(f.invocation).concat(param+")\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("\n\treturn ").concat(f.invocation).concat(param+")\n");
                }
            }
            else{
                if(f.asynch){
                    wrappedFunc = wrappedFunc.concat("\t").concat(f.name+"Res"+i+" = await ").concat(f.invocation).concat(param+")\n");
                }else{
                    wrappedFunc = wrappedFunc.concat("\t").concat(f.name+"Res"+i+" = ").concat(f.invocation).concat(param+")\n");
                }           
                param = f.name+"Res"+i;
            }
        });
        callback(wrappedFunc);
    }   
}

/**
 * 
 * @param {*} funcs 
 * @param {*} seqName 
 * @param {*} binaries_timestamp 
 * @param {*} callback 
 */
function mergeDiffLangActions(funcs,seqName,binaries_timestamp,callback){

    logger.log("Merging different lang actions","info");

    const kinds = funcs.map(f =>{
        return f.kind
    });
    
    var build_args_kinds = "";
    var img_tag = ""

    kinds.forEach(k =>{
        if(!k.includes("nodejs")){
            if(k.includes("python")){
                build_args_kinds = build_args_kinds.concat(" --build-arg PY=true")
                img_tag = img_tag.concat("py")
            }
            if(k.includes("dotnet")){
                build_args_kinds = build_args_kinds.concat(" --build-arg NET=true")
                img_tag = img_tag.concat("nt")
            }
            if(k.includes("ruby")){
                build_args_kinds = build_args_kinds.concat(" --build-arg RUBY=true")
                img_tag = img_tag.concat("rb")
            }
            if(k.includes("swift")){
                build_args_kinds = build_args_kinds.concat(" --build-arg SWIFT=true")
                img_tag = img_tag.concat("sw")
            }
            if(k.includes("rust")){
                build_args_kinds = build_args_kinds.concat(" --build-arg RUST=true")
                img_tag = img_tag.concat("rs")
            }
            if(k.includes("php")){
                build_args_kinds = build_args_kinds.concat(" --build-arg PHP=true")
                img_tag = img_tag.concat("ph")
            }
            if(k.includes("go")){
                build_args_kinds = build_args_kinds.concat(" --build-arg GO=true")
                img_tag = img_tag.concat("go")
            }
            if(k.includes("ballerina")){
                build_args_kinds = build_args_kinds.concat(" --build-arg BALLERINA=true")
                img_tag = img_tag.concat("bll")
            }
            if(k.includes("java")){
                build_args_kinds = build_args_kinds.concat(" --build-arg JAVA=true")
                img_tag = img_tag.concat("java")
            }
        }
    });

    var imports = "";
    var dependecies = {}
    const import_spawn = "const {execSync} = require('child_process');\n"

    var param = funcs[0].param;
    const binaries = path.join(__dirname,"src/utils/binaries/");
    fs.mkdirSync(binaries+ binaries_timestamp, { recursive: true });
    
    var wrappedFunc = import_spawn.concat("function main("+param+") {\n");

    const prevFuncs = []
    
    funcs.forEach(f => {

        if(!prevFuncs.includes(f.name)){
            if(!f.kind.includes("nodejs")){

                wrappedFunc = wrappedFunc.concat("\n");
                wrappedFunc = wrappedFunc.concat("function "+f.invocation+f.param+"){\n\n");
                // qua va la roba per il python script e la modifica del python script
                if(f.kind.includes("python")){
                    const fileName = f.kind.split(":")[0]+Date.now()+".py";
                    wrappedFunc = wrappedFunc.concat("return JSON.parse(execSync(\"python3 "+fileName+" '\"+JSON.stringify("+f.param+")+\"'\").toString().replace(/'/g,'\"'));\n}\n")
                    
                    var codeArray = f.code.split(os.EOL);
                    var newcode = "";
                    let linecount = 0;
                    codeArray.forEach(line => {
                        if(linecount == 0){
                            newcode = "import sys\nimport json\n";
                            linecount++;
                        }
                        if(line.includes("print(")){
                            newcode = newcode.concat("#").concat(line).concat("\n");
                        }
                        else{
                            if(line.includes("return")){
                                line = line.replace("return ","print(");
                                newcode = newcode.concat(line).concat(")");
                                newcode = newcode.concat("\n").concat(f.invocation).concat("json.loads(sys.argv[1]))\n") // dovrei vedere la funzione come si chiama
                            }else{
                                newcode = newcode.concat(line).concat("\n");
                            }
                        }   
                    });  
                    let buff = Buffer.from(newcode, 'utf8');

                    fs.writeFileSync(binaries + binaries_timestamp +"/"+ fileName, buff,{encoding: "utf8"});
                }/*
                if(f.kind.includes("ruby")){
                    const fileName = f.kind.split(":")[0]+Date.now()+".rb";
                    //ATTIVA QUESTO PER PROVARE A VEDERE SE NON REINSTALLA PYTHON MILLE
                    wrappedFunc = wrappedFunc.concat("return JSON.parse(execSync(\"ruby "+fileName+" '\"+JSON.stringify("+f.param+")+\"'\").toString().replace(/'/g,'\"'));\n}\n")
                    
                    var codeArray = f.code.split(os.EOL);
                    var newcode = "";
                    let linecount = 0;
                    codeArray.forEach(line => {
                        if(linecount == 0){
                            newcode = "import sys\nimport json\n";
                            linecount++;
                        }
                        if(line.includes("print(")){
                            newcode = newcode.concat("#").concat(line).concat("\n");
                        }
                        else{
                            if(line.includes("return")){
                                line = line.replace("return ","print(");
                                newcode = newcode.concat(line).concat(")");
                                newcode = newcode.concat("\n").concat(f.invocation).concat("json.loads(sys.argv[1]))\n") // dovrei vedere la funzione come si chiama
                            }else{
                                newcode = newcode.concat(line).concat("\n");
                            }
                        }   
                    });  
                    let buff = Buffer.from(newcode, 'utf8');

                    fs.writeFileSync(binaries + binaries_timestamp +"/"+ fileName, buff,{encoding: "utf8"});
                }*/

            }else{
                if(f.binary){
                    var lines = f.code.split(os.EOL);
                    var new_code = ""
                    lines.forEach(line => {
                        if(line.includes("import ") || line.includes("require(")){
                            // la riga contiene un import
                            /**
                             * 
                             * E SE UNO USA I REQUIRE E IMPORT INSIEME??
                             */
                            
                            imports = imports.concat(line).concat("\n");
                        }else{
                            if(!line.includes("exports.main")){
                                new_code = new_code.concat(line)
                            }                       
                        }   
                    })
                    //recupero le corrette dipendenze
                    if(f.dependecies != "") Object.assign(dependecies,f.dependecies);
                    f.code = new_code;
                }         

                wrappedFunc = wrappedFunc.concat(f.code).concat("\n");
            }
        }
        prevFuncs.push(f.name)
    });

    var importArray = imports.split(os.EOL);
    var uniqImports = [...new Set(importArray)];
    var importsString = "";
    if(uniqImports.length > 0){
        uniqImports.forEach(imp =>{
            importsString = importsString.concat(imp+"\n")
        })
    }
    
    Object.assign(dependecies,{"child_process": "latest"})
    var wrappedFunc = importsString.concat(wrappedFunc);    

    funcs.forEach((f,i) => {
        if(i == funcs.length -1){     
            if(f.asynch)  {
                wrappedFunc = wrappedFunc.concat("return await ").concat(f.invocation).concat(param+");\n");

            }else{
                wrappedFunc = wrappedFunc.concat("return ").concat(f.invocation).concat(param+");\n");
            }
        }
        else{
            if(f.asynch)  {
                wrappedFunc = wrappedFunc.concat("var "+f.name+"Res"+i+" await = ").concat(f.invocation).concat(param+");\n");

            }else{
                wrappedFunc = wrappedFunc.concat("var "+f.name+"Res"+i+" = ").concat(f.invocation).concat(param+");\n");
            }
            param = f.name+"Res"+i;         
        }
    });
    wrappedFunc = wrappedFunc.concat("}\n").concat("exports.main = main;\n");

    let buff = Buffer.from(wrappedFunc, 'utf8');
    var pjraw = {
        "name": seqName,
        "version": "1.0.0",
        "description": "Optimization of sequence "+seqName+" made by Owo",
        "main": "index.js",
        "author": "Owo",
        "license": "Apache-2.0",
        "dependencies": dependecies
    };
    let pj = Buffer.from(JSON.stringify(pjraw),"utf8");
    
    const dir_stamp = Date.now()
    dir_path = binaries+ binaries_timestamp +"/"+dir_stamp ;
    fs.mkdirSync(dir_path)
    funcs.forEach((f) => {
        f.file_list.forEach((file)=>{
            child_process.execSync("cp "+binaries+ binaries_timestamp +"/"+file+ " "+dir_path+"/"+file)
        })
    })
    
    fs.writeFileSync(dir_path + '/package.json', pj,{encoding: "utf8"});
    fs.writeFileSync(dir_path+ '/index.js', buff,{encoding: "utf8"});
    const full_docker_img = conf.DOCKER_IMG_FULL+":"+img_tag

    child_process.execSync("(cd "+path.join(__dirname,"/dockers/custom_runtime/")+"; docker build . -t "+full_docker_img+")").toString();
    child_process.execSync("docker push "+full_docker_img).toString();

    callback(dir_path,full_docker_img);
}

/**
 * 
 * @param {*} snippet 
 * @returns 
 */
function detectLangSimple(snippet){
    let tmpKind;
    if(snippet.includes("function ")){
        tmpKind = "nodejs";
    }
    if(snippet.includes("def ")){
        tmpKind = "python";
    }

    return tmpKind+":default";
}

/**
 * 
 * @param {*} timestamp 
 * @returns 
 */
function getPackageInfoBinaryNode(timestamp){
    const fullPath = path.join(__dirname,"src/utils/zip_workdir/extracted/"+timestamp);
    var ls = child_process.execSync("ls "+fullPath).toString();
    var lsSplit = ls.split("\n");
    var pack = "";
    lsSplit.forEach(elem =>{
        if(elem.includes(".json")){
            pack = child_process.execSync("cat "+fullPath+"/"+elem);    
        }
    })
    return pack.toString();
}

/**
 * 
 * @param {*} timestamp 
 * @param {*} name 
 * @returns 
 */
function getMainFileBinary(timestamp,name){

    const fullPath = path.join(__dirname,"src/utils/zip_workdir/extracted/"+timestamp+"/");
    var func = "";
    func = child_process.execSync("cat "+fullPath+name);

    return func.toString();
}

function copyAllFiles(extracted,binaries,main_name,dependecies_file){
    const fullPath_extracted = path.join(__dirname,extracted);
    const fullPath_binaries = path.join(__dirname,binaries);

    var lsFiles = child_process.execSync("ls -p "+fullPath_extracted +" | grep -v / ").toString();
    var lsSplitFiles = lsFiles.split("\n");
    var file_list = []    
    const timestamp = Date.now()
    lsSplitFiles.forEach(file =>{
        if(!file.includes(main_name) && !file.includes(dependecies_file) && file.length > 1){
            const tmp = file.split(".")
            child_process.execSync("cp -r "+fullPath_extracted+"/"+file + " " +fullPath_binaries+"/"+tmp[0]+"-"+timestamp+"."+tmp[1]); 
            file_list.push(tmp[0]+"-"+timestamp+"."+tmp[1])      
        }
    })

    var subDirCount = child_process.execSync("find "+ fullPath_extracted +"/ -maxdepth 1 -type d | wc -l");
    if(subDirCount > 1){
        var lsDirs = child_process.execSync("ls -d "+fullPath_extracted +"/*/").toString();
        var lsSplitDirs = lsDirs.split("\n");
        lsSplitDirs.forEach(dir =>{
            if(dir.length > 1 ){
                const dir_arr = dir.split("/");
                const dirname = dir_arr[dir_arr.length -2]

                child_process.execSync("cp -R "+fullPath_extracted+"/"+dirname + " " +fullPath_binaries+"/"+dirname);            
            }
        })
    }
    return file_list
}

/**
 * 
 * @param {*} funcs_with_metrics 
 * @param {*} sequence_metrics 
 * @param {*} seqLen 
 * @param {*} whole 
 * @param {*} callback 
 */
function applyMergePolicies(funcs_with_metrics,sequence_metrics,seqLen,whole,callback){

    let isToMerge = false;

    /**
     * INTRA ACTIONS ANALISIS
     */
    const p = 2000;
    const condActionLatency = sequence_metrics.waitTime;
    let finalCodeSize = 0;
    let finalMemRequirement = 0;
    let totalDuration = 0;
    let totalWaitTime = 0;
    let totalInitTime = 0;
    funcs_with_metrics.forEach(fm => {
        finalCodeSize = finalCodeSize + fm.code_size;
        finalMemRequirement = finalMemRequirement + fm.limits.memory;
        totalWaitTime = totalWaitTime + fm.metrics.waitTime;
        totalInitTime = totalInitTime + fm.metrics.initTime;
        totalDuration = totalDuration + fm.metrics.duration;
    });

    const mb = 1024000

    const avgWaitTime = totalWaitTime/seqLen;
    const avgInitTime = totalInitTime/seqLen;

    if(avgWaitTime > avgInitTime - ((condActionLatency - p)/(seqLen -1))) isToMerge = true;

    // fin qui needs_partial è sempre false
    if(whole){
        if( finalCodeSize > conf.LIMITS.codeSize || totalDuration > conf.LIMITS.limits.timeout || finalMemRequirement > conf.LIMITS.limits.memory){
            callback(false,funcs_with_metrics);
        }
        callback(isToMerge,funcs_with_metrics);
    }


    /**
     * IN ACTION ANALISIS
     */
    funcs_with_metrics.forEach(f=>{
        let out = true;
        if(f.metrics.duration >= f.metrics.waitTime){
            out = false;
        }
        if(f.metrics.activations/sequence_metrics.activations > 2){
            out = false;
        }
        f.to_merge = out
    });

    callback(isToMerge,funcs_with_metrics);
}

/**
 * 
 * @param {*} funcs_with_metrics 
 * @param {*} sequence_metrics 
 * @param {*} seqLen 
 * @param {*} whole 
 * @param {*} configuration 
 * @param {*} callback 
 */
//28/10/2022
export function applyMergePoliciesNuovaPolicy(funcs_with_metrics,sequence_metrics,seqLen,whole,configuration,callback){


    function check(funcs){
        const condActionLatency = sequence_metrics.waitTime;
        let isToMerge = false;
        const p = 2000;
        let finalCodeSize = 0;
        let finalMemRequirement = 0;
        let totalDuration = 0;
        let totalWaitTime = 0;
        let totalInitTime = 0;
        const mb = 1024000;
        funcs.forEach(fm => {
            finalCodeSize = finalCodeSize + fm.code_size;
            finalMemRequirement = finalMemRequirement + fm.limits.memory;
            totalWaitTime = totalWaitTime + fm.metrics.waitTime;
            totalInitTime = totalInitTime + fm.metrics.initTime;
            totalDuration = totalDuration + fm.metrics.duration;
        });


        const avgWaitTime = totalWaitTime/seqLen;
        const avgInitTime = totalInitTime/seqLen;

        if( finalCodeSize > conf.LIMITS.codeSize/mb || totalDuration > conf.LIMITS.limits.timeout || finalMemRequirement > conf.LIMITS.limits.memory){
            return isToMerge;
        }

        if(avgWaitTime > avgInitTime - ((condActionLatency - p)/(seqLen -1))) isToMerge = true;

        return {"outcome":isToMerge,"funcs":funcs};
    }

    /**
     * INTRA ACTIONS ANALISIS
     */
    

    if(whole){
        const res = check(funcs_with_metrics);
        callback(res.outcome,res.funcs,false);
    }else{
        /**
         * IN ACTION ANALISIS 
         * DISCOVER IF IS NEEDED PARTIAL MERGE
         */
        funcs_with_metrics.forEach(f=>{
            let out = true;
            //forse qua potrei fare il sistema a punteggio? 
            /**
             * TIPO:
             *  DURATION/WAIT_TIME -> DA NORMALIZZARE TRA 0 E 1
             *  ACTIVATION/SEQ_ACTIVATION -> DA NORMALIZZARE TRA 0 E 1
             * 
             */
            if(f.metrics.duration >= f.metrics.waitTime){
                out = false;
            }
            if(f.metrics.activations/sequence_metrics.activations > 2){
                out = false;
            }
            f.to_merge = out
        });

        const new_conf = checkPartialMerges(funcs_with_metrics,configuration);

        if(new_conf.length == 1){
            const res =  check(new_conf[0])
            callback(res.outcome,res.funcs,false);
        }else{
            let end_funcs = []
            const expected = new_conf.length;
            let res;
            new_conf.forEach(ncf => {
                if(ncf.length == 1) end_funcs.push(ncf)
                else{
                    res = check(ncf);
                    if(res.outcome) end_funcs.push(res.funcs)
                }
            });

            if(expected.length == end_funcs.length){
                callback(true,end_funcs,true);
            }else{
                callback(false,end_funcs,true);
            }
        }
    }
}

/**
 * 
 * @param {*} functions_array 
 * @param {*} configuration 
 * @returns 
 */
function checkPartialMerges(functions_array,configuration){

    let index = 0;
    var  new_configuration = [];
    var sub_sequence = [];

    while(index < configuration.length) {

        const fn = configuration[index]
        let i = 0;
        let fi;
        while(i < functions_array.length ){
            if(functions_array[i].name == fn) {
                fi = functions_array[i];
                break;
            }
            i++
        }

        
        if(fi.to_merge) {
            // la funzione è da fondere, la aggiungo alla nuova sottosequenza 
            sub_sequence.push(fi);

            //controllo se è l'ultima funzione
            if(index +1 == functions_array.length)  new_configuration.push(sub_sequence)
        }else{
            // la funzione non è da fondere, la aggiungo da sola
            if(sub_sequence.length > 0){
                new_configuration.push(sub_sequence)
                sub_sequence = [];
            }
            new_configuration.push([fi]);
        }
        index++;
    }

    return  new_configuration;
}

export {  
        merge,
        detectLangSimple,
        getMainFileBinary,
        getPackageInfoBinaryNode,
        copyAllFiles,
        applyMergePolicies,
        checkPartialMerges
    };

