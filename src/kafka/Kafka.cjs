const { Kafka, Partitioners } = require('kafkajs')
const conf =  require("../../config/conf.cjs");
const logger = require("../log/logger.cjs")

//const { KAFKA_USERNAME: username, KAFKA_PASSWORD: password } = process.env
//const sasl = username && password ? { username, password, mechanism: 'plain' } : null
const sasl = null;
const ssl = !!sasl

const topicS = conf.KAFKA_TOPIC_PRODUCE;
const topicC = conf.KAFKA_TOPIC_CONSUME;

// This creates a client instance that is configured to connect to the Kafka broker provided by
// the environment variable KAFKA_BOOTSTRAP_SERVER
logger.log("conf.KAFKA_BOOTSTRAP_SERVER: " + conf.KAFKA_BOOTSTRAP_SERVER,"info")

const kafka = new Kafka({
  clientId: 'faas-optimizer',
  brokers: [conf.KAFKA_BOOTSTRAP_SERVER],
  ssl,
  sasl
})

const admin = kafka.admin();
//const producer = kafka.producer();
const producer = kafka.producer({createPartitioner: Partitioners.LegacyPartitioner});
const consumer = kafka.consumer({ groupId: "default" });

/**
 * @returns Nothing
 */
 async function init(){

    //serve un topic per il sender e uno per il receiver
    try {
        await admin.connect()
        //ottenere lista topics
        const list = admin.listTopics();
        const listResolved = await Promise.resolve(list)
        if(!listResolved.includes(topicC) && !listResolved.includes(topicS) ){
            await admin.createTopics({
                topics: [ { topic:topicS ,numPartitions: 1, replicationFactor: 1 } , {topic: topicC, numPartitions: 1, replicationFactor: 1 } ],
                waitForLeaders: true,
            })
        }
        
        await producer.connect()
        await consumer.connect()

        await consumer.subscribe({
            topic: topicC,
            fromBeginning: true
        })
        return true;
    } catch (error) {
        logger.log(error,"error");
        return false;
        //process.exit(1)
    }
}

/**
 * 
 * @param {JSON object} message Message to send to kafka broker
 * @returns Nothing
 */

async function sendToKafka(message){

  try {
      const responses = await producer.send({
        topic: topicS,
        messages: [{
          // Name of the published package as key, to make sure that we process events in order
          key: "config",
  
          // The message value is just bytes to Kafka, so we need to serialize our JavaScript
          // object to a JSON string. Other serialization methods like Avro are available.
          value: JSON.stringify({
            package: message,
            version: 1
          })
        }]
      })
      logger.log("Published configuration" + JSON.stringify(responses) ,"info")
    } catch (error) {
      logger.log('Error publishing message woth error: '+error, "error")
    }
}

async function receiveFromKafka(){

    try {
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                console.log('Received message', {
                    topic,
                    partition,
                    key: message.key.toString(),
                    value: message.value.toString()
                });
                return message;
            }
        })  
    } catch (error) {
        try {
            await consumer.disconnect()
        } catch (e) {
            logger.log('Failed to gracefully disconnect consumer '+e, "error")
        }
    }
}

/**
 * 
 * @param {*} pre 
 * @param {*} post 
 * @param {*} period 
 * @param {*} limit 
 * @param {*} condAction 
 * @returns Message for kafka
 */

function buildMessage(pre,post,period,limit,preMetrics,only_seq){

    const condActionDuration = preMetrics.duration/1000;
    const condActionArrivalRate = preMetrics.arrivalRate    

    var avgColdStartRate = 0.0;
    var avgColdStartDuration = 0.0;
    var message = {
                    "name":"test", // name of the configuration
                    "seq":{
                        "name":"seq",
                        "arrivalRate":post == null ? condActionArrivalRate:0.0,
                        //"arrivalRate":condActionArrivalRate*10,
                        //"arrivalRate":0.5,
                        "avgDuration":condActionDuration != null && condActionDuration != undefined  &&  condActionDuration > 0 ? condActionDuration:0,
                    },
                    "preFunctions":[],// functions entry   {"name":"F1","arrivalRate":, .... ,  },
                    "postFunctions":[],// functions entry   {"name":"F1","arrivalRate":, .... ,  },
                    "preNum": 0,// int
                    "postNum": 0,// int
                    "condActionDuration":condActionDuration != null && condActionDuration != undefined  &&  condActionDuration > 0 ? condActionDuration:0, //int seqDuration+ seqWaitTime/seqLen
                    "avgColdStartRate":avgColdStartRate ,// double
                    "avgColdStartDuration":avgColdStartDuration,//double
                    "stopTime":300, // int
                    "cpus":4,//int
                    "mem":4096, // int
                    "num":1, //Int
                    "maxParallelism":limit.concurrency,//Int
                    "minParallelism":1 //Int
                }

    let preFunctions = []

    pre.forEach((funcs,i) => {

        preFunctions.push({
            "name":funcs.function.name,
            "arrivalRate":only_seq ? 0.0 :( post == null ? funcs.metrics.arrivalRate: (funcs.metrics.arrivalRate - condActionArrivalRate)),
            //"arrivalRate":funcs.metrics.arrivalRate*10,
            //"arrivalRate":0.5,
            "avgDuration":funcs.metrics.duration/1000,
            "memory":funcs.function.limits.memory
            })  
        avgColdStartRate += funcs.metrics.coldStartsRate
        avgColdStartDuration += funcs.metrics.coldStartDuration /1000
        //avgColdStartDuration += funcs.metrics.coldStartDuration + (funcs.metrics.waitTime > 2000 ? funcs.metrics.waitTime - 2000:0)
        
        if(only_seq & i == 0 ){
            preFunctions[0].arrivalRate = condActionArrivalRate > 0 ?condActionArrivalRate:funcs.metrics.arrivalRate
        }
    });

    if(post == null){
        
        const flength = preFunctions.length
        message.preFunctions = preFunctions
        message.postFunctions = []
        message.preNum = preFunctions.length
        message.postNum = 0
        message.avgColdStartRate = avgColdStartRate  != null  &&  avgColdStartRate != undefined && avgColdStartRate > 0 ? avgColdStartRate/flength : 0.0
        message.avgColdStartDuration = avgColdStartDuration != null  && avgColdStartRate != undefined &&  avgColdStartDuration > 0 ? avgColdStartDuration + 2000:2500
        message.avgColdStartDuration = message.avgColdStartDuration/1000
    }else{

        const postFunctions = []

        if(Array.isArray(post)){
            post.forEach(funcs => {
            
                postFunctions.push({
                    "name":funcs.function.name,
                    "arrivalRate":condActionArrivalRate,
                    //"arrivalRate":funcs.metrics.arrivalRate,
                    //"arrivalRate":funcs.metrics.arrivalRate*10,
                    //"arrivalRate":0.5,
                    "avgDuration":funcs.metrics.duration/1000,
                    "memory":funcs.function.limits.memory
                    })  
                avgColdStartRate += funcs.metrics.coldStartsRate
                avgColdStartDuration += funcs.metrics.coldStartDuration 
                //avgColdStartDuration += funcs.metrics.coldStartDuration + (funcs.metrics.waitTime > 2000 ? funcs.metrics.waitTime - 2000:0)
            });
        }else{
            postFunctions.push({
                "name":post.function.name,
                "arrivalRate":condActionArrivalRate,
                //"arrivalRate":post.metrics.arrivalRate,
                //"arrivalRate":funcs.metrics.arrivalRate*10,
                //"arrivalRate":0.5,
                "avgDuration":post.metrics.duration/1000,
                "memory":post.function.limits.memory
                })  
            avgColdStartRate += post.metrics.coldStartsRate
            avgColdStartDuration += post.metrics.coldStartDuration
            //avgColdStartDuration += funcs.metrics.coldStartDuration  + (funcs.metrics.waitTime > 2000 ? funcs.metrics.waitTime - 2000:0)
        }

        const flength = preFunctions.length + postFunctions.length
        message.preFunctions = preFunctions
        message.postFunctions = postFunctions
        message.preNum = preFunctions.length
        message.postNum = postFunctions.length
        message.avgColdStartRate = avgColdStartRate != null && avgColdStartRate != undefined && avgColdStartRate > 0  ? avgColdStartRate/flength : 0.0
        message.avgColdStartDuration = avgColdStartDuration != null && avgColdStartRate != undefined && avgColdStartDuration > 0  ? avgColdStartDuration + 2000:2500
        message.avgColdStartDuration = message.avgColdStartDuration/1000
    }

    return message;
}

function buildMessageSimulationOptimization(pre,post,period,limit,preMetrics,only_seq){

    const condActionDuration = preMetrics.duration/1000;
    const condActionArrivalRate = preMetrics.arrivalRate    

    var avgColdStartRate = 0.0;
    var avgColdStartDuration = 0.0;
    var message = {
                    "name":"test", // name of the configuration
                    "seq":{
                        "name":"seq",
                        "arrivalRate":post == null ? condActionArrivalRate:0.0,
                        "avgDuration":condActionDuration != null && condActionDuration != undefined  &&  condActionDuration > 0 ? condActionDuration:0,
                    },
                    "preFunctions":[],// functions entry   {"name":"F1","arrivalRate":, .... ,  },
                    "postFunctions":[],// functions entry   {"name":"F1","arrivalRate":, .... ,  },
                    "preNum": 0,// int
                    "postNum": 0,// int
                    "condActionDuration":condActionDuration != null && condActionDuration != undefined  &&  condActionDuration > 0 ? condActionDuration:0, //int seqDuration+ seqWaitTime/seqLen
                    "avgColdStartRate":avgColdStartRate ,// double
                    "avgColdStartDuration":avgColdStartDuration,//double
                    "stopTime":300, // int
                }

    let preFunctions = []

    pre.forEach((funcs,i) => {

        preFunctions.push({
            "name":funcs.function.name,
            "arrivalRate":only_seq ? 0.0 :( post == null ? funcs.metrics.arrivalRate: (funcs.metrics.arrivalRate - condActionArrivalRate)),
            "avgDuration":funcs.metrics.duration/1000,
            "memory":funcs.function.limits.memory
            })  
        avgColdStartRate += funcs.metrics.coldStartsRate
        avgColdStartDuration += funcs.metrics.coldStartDuration /1000
        
        if(only_seq & i == 0 ){
            preFunctions[0].arrivalRate = condActionArrivalRate > 0 ?condActionArrivalRate:funcs.metrics.arrivalRate
        }
    });

    if(post == null){
        
        const flength = preFunctions.length
        message.preFunctions = preFunctions
        message.postFunctions = []
        message.preNum = preFunctions.length
        message.postNum = 0
        message.avgColdStartRate = avgColdStartRate  != null  &&  avgColdStartRate != undefined && avgColdStartRate > 0 ? avgColdStartRate/flength : 0.0
        message.avgColdStartDuration = avgColdStartDuration != null  && avgColdStartRate != undefined &&  avgColdStartDuration > 0 ? avgColdStartDuration + 2000:2500
        message.avgColdStartDuration = message.avgColdStartDuration/1000
    }else{

        const postFunctions = []

        if(Array.isArray(post)){
            post.forEach(funcs => {
            
                postFunctions.push({
                    "name":funcs.function.name,
                    "arrivalRate":condActionArrivalRate,
                    "avgDuration":funcs.metrics.duration/1000,
                    "memory":funcs.function.limits.memory
                    })  
                avgColdStartRate += funcs.metrics.coldStartsRate
                avgColdStartDuration += funcs.metrics.coldStartDuration 
            });
        }else{
            postFunctions.push({
                "name":post.function.name,
                "arrivalRate":condActionArrivalRate,
                "avgDuration":post.metrics.duration/1000,
                "memory":post.function.limits.memory
                })  
            avgColdStartRate += post.metrics.coldStartsRate
            avgColdStartDuration += post.metrics.coldStartDuration
        }

        const flength = preFunctions.length + postFunctions.length
        message.preFunctions = preFunctions
        message.postFunctions = postFunctions
        message.preNum = preFunctions.length
        message.postNum = postFunctions.length
        message.avgColdStartRate = avgColdStartRate != null && avgColdStartRate != undefined && avgColdStartRate > 0  ? avgColdStartRate/flength : 0.0
        message.avgColdStartDuration = avgColdStartDuration != null && avgColdStartRate != undefined && avgColdStartDuration > 0  ? avgColdStartDuration + 2000:2500
        message.avgColdStartDuration = message.avgColdStartDuration/1000
    }

    return message;
}

module.exports = {sendToKafka,receiveFromKafka,buildMessage,init}