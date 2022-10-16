import * as logger from "../log/logger.cjs";
import * as fs from 'fs';
import path from "path";
import os from 'os';
import child_process from "child_process";
import conf from "../../config/conf.cjs";
import * as fg from "../openwhisk/action_gestures.js";
import * as zipgest from "./zip_gestures.cjs";

const __dirname = path.resolve();

async function merge(functions_to_merge,seq_name,whole){
    return new Promise(function(resolve, reject) {

        if(!whole) seq_name = seq_name+"-part"+Date.now();

        var sameLangCounter = 0;
        const prevKind = functions_to_merge[0].kind;
        var merged_seq_limits = fg.computeLimit(functions_to_merge);
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
                    zipgest.zipDirLocalCB("binaries/" + timestamp_folder, (file) => {
                        const size = zipgest.getFileSize("binaries/" + timestamp_folder+ ".zip");
                        const mb = 1024000

                        if(size/mb >= 35){
                            res.json("Arctifact too big, sequence can't be optimized")
                            return;
                        }else{
                            fg.createActionCB(seq_name, file, prevKind,"binary",merged_seq_limits, function (result) {
                                zipgest.cleanDirs("/binaries/" + timestamp_folder);
                                zipgest.cleanDirs("/binaries/" + timestamp_folder + ".zip");
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
                                resolve( [seq_name,merged_seq_limits,result]);
                            });
                        });
                    }else{
                        fg.createActionCB(seq_name, wrappedFunc, prevKind,"plain",merged_seq_limits, function (result) {
                            resolve( [seq_name,merged_seq_limits,result]);
                        });  
                    }         
                });
            }        
        } else {

            //le functions non hanno tutte le stessa Kind (linguaggio) devo fonderle come binary ( zip file )
            //LA FUNZIONE FA IL MERGE DI FUNZIONI DI LUNGUAGGIO DIVERSO MA NON DI FUNZIONI 
            //PLAIN TEXT CON FUNZIONI BINARIE

            //mergeDiffLangActions(funcs, seq_name,binaries_timestamp, function (timestamp_folder,docker_img) {
            mergeFuncsDiffLangPlainTextBinary(funcs, seq_name,binaries_timestamp, function (timestamp_folder) {
                zipgest.zipDirLocalCB("binaries/" + timestamp_folder, (file) => {
                    const size = zipgest.getFileSize("binaries/" + timestamp_folder+ ".zip");
                    const mb = 1024000

                    if(size/mb >= 35){
                        res.json("Arctifact too big, sequence can't be optimized")
                        return;
                    }else{
                        if(whole){
                            fg.deleteActionCB(seq_name, function (data) {
                                fg.createActionCB(seq_name, file,"nodejs:default" ,"binary",merged_seq_limits, function (result) {
                                    zipgest.cleanDirs("/binaries/" + timestamp_folder);
                                    zipgest.cleanDirs("/binaries/" + timestamp_folder + ".zip");
                                    resolve( [seq_name,merged_seq_limits,result]);
                                });
                            })
                        }else{
                            fg.createActionCB(seq_name, file,"nodejs:default" ,"binary",merged_seq_limits, function (result) {      
                                zipgest.cleanDirs("/binaries/" + timestamp_folder);
                                zipgest.cleanDirs("/binaries/" + timestamp_folder + ".zip");
                                resolve( [seq_name,merged_seq_limits,result]);
                            }); 
                        }   
                    }                               
                })
            });        
        }
    });
}

function mergeFuncsBinarySameLangCB(funcs,seqName,binaries_timestamp,callback){


    /**
     * SUPPORTED LANGS:
        -NODEJS
        -PYTHON
    */

    logger.log("Merging same lang actions to binary","info");
    const fkind = funcs[0].kind;
    if(fkind.includes("nodejs")){
        //IF NODEJS

        var imports = "";
        var dependecies = {}
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
        
        fs.writeFileSync(binaries+ binaries_timestamp + '/package.json', pj,{encoding: "utf8"});
        fs.writeFileSync(binaries+ binaries_timestamp + '/index.js', buff,{encoding: "utf8"});

        //CICLO PER SCRIVERE TUTTI GLI ALTRI FILES SE CE NE SONO

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
        fs.writeFileSync(binaries+ binaries_timestamp + '/__main__.py', buff,{encoding: "utf8"});

        //CICLO PER SCRIVERE TUTTI GLI ALTRI FILES SE CE NE SONO

    }    
    callback(binaries_timestamp);

}

function mergeFuncsDiffLangPlainTextBinary(funcs,seqName,binaries_timestamp,callback){

    /**
     * MERGE DI DUE FUNZIONI DI LINGUAGGIO DIVERSO (non binarie) IN UNA FUNZIONE BINARIA NODEJS
     */

    logger.log("Merging actions","info");

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
                    //ATTIVA QUESTO PER PROVARE A VEDERE SE NON REINSTALLA PYTHON MILLE
                    //wrappedFunc = wrappedFunc.concat("execSync('if [ $( python3 --version | grep -c \"Python \") -eq -1 ]; then apt-get install python3; fi');\n");
                    wrappedFunc = wrappedFunc.concat("execSync('apt-get install python3');\n");
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
                }

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
        "description": "An action written as an npm package.",
        "main": "index.js",
        "author": "FaaS-Optimizer",
        "license": "Apache-2.0",
        "dependencies": dependecies
    };
    let pj = Buffer.from(JSON.stringify(pjraw),"utf8");
    
    fs.writeFileSync(binaries+ binaries_timestamp + '/package.json', pj,{encoding: "utf8"});
    fs.writeFileSync(binaries+ binaries_timestamp + '/index.js', buff,{encoding: "utf8"});

    callback(binaries_timestamp);
}

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

function mergeDiffLangActions(funcs,seqName,binaries_timestamp,callback){
    /**
     * MERGE USING DOCKER ACTIONS
     * 
     * NEEDS:
     * 
     * A LIST OF THE LANGUAGES OF THE ACTIONS 
     * 
     * DOCKERFILE BUILD 
     * 
     * TO PUSH DOCKER IMAGES TO DOCKER HUB
     * 
     * 
     * 
     */

    /**
     * MERGE DI DUE FUNZIONI DI LINGUAGGIO DIVERSO IN UNA FUNZIONE BINARIA NODEJS CON I CORRETTI ENVIRONMENT INSTALLATI
     */

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
                    //ATTIVA QUESTO PER PROVARE A VEDERE SE NON REINSTALLA PYTHON MILLE
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
        "description": "An action written as an npm package.",
        "main": "index.js",
        "author": "FaaS-Optimizer",
        "license": "Apache-2.0",
        "dependencies": dependecies
    };
    let pj = Buffer.from(JSON.stringify(pjraw),"utf8");
    
    fs.writeFileSync(binaries+ binaries_timestamp + '/package.json', pj,{encoding: "utf8"});
    fs.writeFileSync(binaries+ binaries_timestamp + '/index.js', buff,{encoding: "utf8"});
    const full_docker_img = conf.DOCKER_BASE_IMG+":"+img_tag

    child_process.execSync("docker build . -t "+full_docker_img+" -f "+path.join(__dirname,"../../dockers/custom_runtime/Dockerfile")).toString();

    callback(binaries_timestamp,full_docker_img);
}

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

function getMainFileBinary(timestamp,name){

    const fullPath = path.join(__dirname,"src/utils/zip_workdir/extracted/"+timestamp+"/");
    var func = "";
    func = child_process.execSync("cat "+fullPath+name);

    return func.toString();
}

function copyAllFilesNew(extracted,binaries,main_name){
    const fullPath_extracted = path.join(__dirname,extracted);
    const fullPath_binaries = path.join(__dirname,binaries);

    var lsFiles = child_process.execSync("ls -p "+fullPath_extracted +" | grep -v / ").toString();
    var lsSplitFiles = lsFiles.split("\n");
    var file_list = []    
    lsSplitFiles.forEach(file =>{
        if(!file.includes(main_name) && file.length > 1){
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

function copyAllFiles(extracted,binaries,main_name){
    const fullPath_extracted = path.join(__dirname,extracted);
    const fullPath_binaries = path.join(__dirname,binaries);

    var lsFiles = child_process.execSync("ls -p "+fullPath_extracted +" | grep -v / ").toString();
    var lsSplitFiles = lsFiles.split("\n");
    lsSplitFiles.forEach(file =>{
        if(!file.includes(main_name) && file.length > 1){
            child_process.execSync("cp -r "+fullPath_extracted+"/"+file + " " +fullPath_binaries+"/"+file+"-"+timestamp);       
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
}

function applyMergePolicies(funcs_with_metrics,callback){


 /*
        IMPORTANTE, SE LE FUINZIONI HANNO LO STESSO NOME NON DEVO FONDERLE, PERCHÈ UTILIZZANO LO STESSO CONTAINER
 */
    var sequenceDuration = 0;
    var coldStartsRate = 0;
    var coldStartAvgDuration = 0;


    // la lunghezza della sequenza incide molto 
    const depth = funcs_with_metrics.length;
    const depthImpact = depth >= 10 ? 2:(depth >= 7 ? 1:0);
    // 0 -> less than 7 , 1 -> in 7 - 10 , 2 -> depth > 10

    funcs_with_metrics.forEach(f =>{

        const durWait = f.metrics.duration < f.metrics.waitTime ? true:false;
        const isAsynch = !f.asynch
        var cs = false;

        if(f.metrics.duration + f.metrics.initTime  < f.metrics.waitTime){
            f.to_merge = true;
        }

        sequenceDuration += f.metrics.duration + f.metrics.waitTime;

        if(f.metrics.coldStarts > 0)  {
            coldStartAvgDuration += f.metrics.waitTime;
            coldStartsRate = f.metrics.coldStarts/f.metrics.activations;

            if(coldStartsRate > 0.4){
                cs = true;
            }
        }

        //f.to_merge = durWait & isAsynch & cs
        f.to_merge = true
        
    })

    callback(funcs_with_metrics);
}

function applyMergePoliciesNew(funcs_with_metrics,sequence_metrics,sequence_limits,callback){
    
        /*      
           IMPORTANTE, SE LE FUINZIONI HANNO LO STESSO NOME POTREI NON DOVERLE FONDERLE, PERCHÈ UTILIZZANO LO STESSO CONTAINER FORSE DIPENDE DAL PARALLELISMO
           

           DEVO VERIFICARE QUANTO LE ACTIONS VENGONO INVOCATE AL DI FUORI DEL WORKFLOW, perchè? 

           SE NEL WORKFLOW VENGONO INVOCATE TANTE VOLTE POTREI FAR AUMENTARE IL LORO NUMERO DI COLD STARTS RIDUCENDONE NOTEVOLMENTE LE PRESTAZIONI
   

           BISOGNA CONSIDERARE ANCHE CHE SE LA SOMMA DELLE DURATION DELLE ACTION SUPERA IL TIMEOUT DI SISTEMA MASSIMO, 
           ALLORA quasi SICURAMENTE NON POSSO FARE IL MERGE
   
        */
/*
        const maxPossibleDuration = sequence_limits.timeout;
        const depth = funcs_with_metrics.length;
        const depthImpact = depth >= 10 ? 2:(depth >= 7 ? 1:0);*/ // 0 -> less than 7 , 1 -> in 7 - 10 , 2 -> depth > 10


       /**
        * 
        * SE LE OCCURRENCIES DI UNA FUNZIONE SONO > 1 MA NON SONO TUTTE CONSECUTIVE, POTREI PERNSARE DI LASCIARLE COME SONO, AVRANNO COLD START BASSI
        * ED IMPATTERANNO POCO, 
        * MA SE LE OCC0RRENZE DELLA FUNZOONE SONO TUTTE CONSECUTIVE, POTRE  COMUNQUE OENBSARE DI FARE IL MERGE
        * 
        * di base nuova regole, se occurrencies > 1 e la proporzione occurrencies/lunghezza seq è di un certo tipo, non le fondo
        */
   
   
       /**
        * CONTROLLO LA PROFONDITA DELLA SEQUENCE 
        * 
        * LA LUNGHEZZA DELLA SEQUENZA INCIDE MOLTO SULLA SUA LATENZA COMPLESSIVA:
        * 
        * VEDI COLD START CASCADING
        * VEDI IMPATTO DELLA COND ACTION
        */











        /*
        var sequenceDuration = 0;
        var sequenceWaitTime = 0;
        var sequenceLatency = 0; // duration + waittime
        var coldStartsRate = 0;
        var coldStartAvgDuration = 0;

        const depth = funcs_with_metrics.length;
        const depthImpact = depth >= 10 ? 2:(depth >= 7 ? 1:0); // 0 -> less than 7 , 1 -> in 7 - 10 , 2 -> depth > 10
   
        funcs_with_metrics.forEach(f =>{
   
            //definisce se duration è minore dell'initTime 
            const isDurationLTIT = f.metrics.duration < f.metrics.initTime ? true:false;
            //definisce se duration è minore del waitTime 
            const isDurationLTWT = f.metrics.duration < f.metrics.waitTime ? true:false;

            const occurrencies = f.occurrencies

            //definisce se il tasso di coldstarts è alto 
            let ishighCsRate = false;

            if(f.metrics.coldStarts > 0)  {
                coldStartAvgDuration += f.metrics.waitTime;
                const thisColdStartsRate = f.metrics.coldStarts/f.metrics.activations;

                if(thisColdStartsRate > 0.5){
                    ishighCsRate = true;
                }
            }



            const csImpact = f.metrics.waitTime/f.metrics.duration;


            //controllo da sistemare sull'impatto del coldstart, di quanti ordini di misura WT è maggiore di duration? 
            const isHighCsImpact = csImpact > 100 ? true:false;
   
            sequenceDuration += f.metrics.duration + f.metrics.waitTime;
   
            //f.to_merge = durWait & isAsynch & cs
           
       })*/

    funcs_with_metrics.forEach(f=>{
        f.to_merge = true
    });

   
    callback(funcs_with_metrics);
}

function checkPartialMerges(functions_array){

    let index = 0;
    var parsed_func_array = [];
    var tmp_array = [];

    while(index < functions_array.length) {
        const fi = functions_array[index];
        if(fi.to_merge) {
            tmp_array.push(fi);
            if(index +1 == functions_array.length) parsed_func_array.push(tmp_array)
        }else{
            if(tmp_array.length > 0){
                parsed_func_array.push(tmp_array)
                tmp_array = [];
            }
            parsed_func_array.push([fi]);
        }
        index++;
    }
    return parsed_func_array;
}

function checkPartialMergesNoRepeat(functions_array,configuration){

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
        mergePlainTextFuncs,
        mergeFuncsDiffLangPlainTextBinary,
        mergeDiffLangActions,
        mergeFuncsBinarySameLangCB,
        detectLangSimple,
        getMainFileBinary,
        applyMergePolicies,
        getPackageInfoBinaryNode,
        copyAllFiles,
        checkPartialMerges,
        applyMergePoliciesNew,
        checkPartialMergesNoRepeat
    };

