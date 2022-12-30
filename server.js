import app from "./src/app.js";
import * as conf from "./config/conf.cjs";
import * as logger from "./src/log/logger.cjs";
import * as kafka from "./src/kafka/Kafka.cjs";
import * as child_process from "child_process";

app.listen(conf.PORT, async ()=>{  
    
  if(conf.SIMULATION_ENABLED){
    const did_connect = await kafka.init()
    if(!did_connect) process.exit(1)
  }

  logger.log(child_process.execSync("sh ./src/bin/loginDocker.sh "+Buffer.from(conf.DOCKER_HUB_USERNAME,"base64").toString('ascii')).toString(),"info")

  logger.log("-------------------------------------------","info");
  logger.log("Environment: ","info");
  logger.log("> API_HOST: "+conf.API_HOST,"info");
  logger.log("> METRICS_ENDPOINT: "+conf.METRICS_ENDPOINT,"info");
  if(conf.SIMULATION_ENABLED) logger.log("> KAFKA_HOST: "+conf.KAFKA_BOOTSTRAP_SERVER,"info");
  logger.log("-------------------------------------------\n\n","info");
  logger.log("Listening on port "+ conf.PORT,"info");
    
});
