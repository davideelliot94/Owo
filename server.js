import app from "./src/app.js";
import * as conf from "./config/conf.cjs";
import * as logger from "./src/log/logger.cjs";
import * as kafka from "./src/kafka/Kafka.cjs";

app.listen(conf.PORT, async ()=>{  
    
    if(conf.IS_SIMULATION){
      const did_connect = await kafka.init()
      if(!did_connect) process.exit(1)
    }

    logger.log("-------------------------------------------","info");
    logger.log("Environment: ","info");
    logger.log("> API_HOST: "+conf.API_HOST,"info");
    logger.log("> METRICS_ENDPOINT: "+conf.METRICS_ENDPOINT,"info");
    if(conf.IS_SIMULATION) logger.log("> KAFKA_HOST: "+conf.KAFKA_BOOTSTRAP_SERVER,"info");
    logger.log("-------------------------------------------\n\n","info");
    logger.log("Listening on port "+ conf.PORT,"info");
    
});
