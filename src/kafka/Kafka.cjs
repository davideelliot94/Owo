const { Kafka, Partitioners } = require('kafkajs')
const conf = require("../../config/conf.cjs");
const logger = require("../log/logger.cjs")

//const { KAFKA_USERNAME: username, KAFKA_PASSWORD: password } = process.env
//const sasl = username && password ? { username, password, mechanism: 'plain' } : null
const sasl = null;
const ssl = !!sasl

const topicS = conf.KAFKA_TOPIC_PRODUCE;
const topicC = conf.KAFKA_TOPIC_CONSUME;

// This creates a client instance that is configured to connect to the Kafka broker provided by
// the environment variable KAFKA_BOOTSTRAP_SERVER
logger.log("conf.KAFKA_BOOTSTRAP_SERVER: " + conf.KAFKA_BOOTSTRAP_SERVER, "info")

const kafka = new Kafka({
    clientId: 'faas-optimizer',
    brokers: [conf.KAFKA_BOOTSTRAP_SERVER],
    ssl,
    sasl
})

const admin = kafka.admin();
//const producer = kafka.producer();
const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
const consumer = kafka.consumer({ groupId: "default-2" });

/**
 * @returns Nothing
 */
async function init() {

    //serve un topic per il sender e uno per il receiver
    try {
        await admin.connect()
        //ottenere lista topics
        const list = admin.listTopics();
        const listResolved = await Promise.resolve(list)
        if (!listResolved.includes(topicC) && !listResolved.includes(topicS)) {
            await admin.createTopics({
                topics: [{ topic: topicS, numPartitions: 1, replicationFactor: 1 }, { topic: topicC, numPartitions: 1, replicationFactor: 1 }],
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
        logger.log(error, "error");
        return false;
        //process.exit(1)
    }
}

/**
 * 
 * @param {JSON object} message Message to send to kafka broker
 * @returns Nothing
 */

async function sendToKafka(message, key) {

    try {
        const responses = await producer.send({
            topic: topicS,
            messages: [{
                // Name of the published package as key, to make sure that we process events in order
                key: key,

                // The message value is just bytes to Kafka, so we need to serialize our JavaScript
                // object to a JSON string. Other serialization methods like Avro are available.
                value: JSON.stringify({
                    package: message,
                    version: 1
                })
            }]
        })
        logger.log("Published configuration" + JSON.stringify(responses), "info")
    } catch (error) {
        logger.log('Error publishing message woth error: ' + error, "error")
    }
}

function computeResponse(message) {
    let response = {
        "original": 0.0,
        "optimized": 0.0
    }

    var originalarr = message.original.split(",");
    originalarr = originalarr.slice(0,originalarr.length -1)
    originalarr.forEach((sv,i) => {
        if(i != originalarr.length - 1 ) {
            response.original = response.original + Number.parseFloat(sv)
        }
    })

    var optimizedarr = message.optimized.split(",") 
    optimizedarr = optimizedarr.slice(0,optimizedarr.length -1)

    optimizedarr.forEach((sv,i) => {
        if(i != optimizedarr.length - 1 ) {
            response.optimized = response.optimized + Number.parseFloat(sv)
        }
    })
    return response;
}

async function receiveFromComputeAndSend(key,res) {

    try {
        return await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                logger.log('Received message \n' +
                    "key:" + message.key.toString()+
                    "value:"+ message.value.toString() +"\n",
                "info");
                if (message.key == key) {
                    const response = computeResponse(JSON.parse(message.value.toString()))
                    res.json({
                        "Original sequence average simulation response time: ": response.original,
                        "Optimized sequence average simulation response time: ": response.optimized
                    });
                }
            }
        })
    } catch (error) {
        try {
            await consumer.disconnect()
        } catch (e) {
            logger.log('Failed to gracefully disconnect consumer ' + e, "error")
        }
    }
}

function buildMessageSimulationOptimization(pre, post, period,limit, preMetrics) {

    const condActionDuration = preMetrics.duration / 1000;
    const condActionArrivalRate = preMetrics.arrivalRate

    var avgColdStartRate = 0.0;
    var avgColdStartDuration = 0.0;
    var message = {
        "name": "test",
        "original": {
            "seq": {
                "name": "seq",
                "arrivalRate": condActionArrivalRate,
                "avgDuration": condActionDuration != null && condActionDuration != undefined && condActionDuration > 0 ? condActionDuration : 0,
            },
            "functions": [],
            "num": 0,
            "avgColdStartRate": avgColdStartRate,// double
            "avgColdStartDuration": avgColdStartDuration//double
        },
        "optimized": {
            "seq": {
                "name": "seq",
                "arrivalRate":  0.0,
                "avgDuration": condActionDuration != null && condActionDuration != undefined && condActionDuration > 0 ? condActionDuration : 0,
            },
            "functions": [],
            "num": 0,
            "avgColdStartRate": avgColdStartRate,// double
            "avgColdStartDuration": avgColdStartDuration//double
        },
        "condActionDuration": condActionDuration != null && condActionDuration != undefined && condActionDuration > 0 ? condActionDuration : 0,//int seqDuration+ seqWaitTime/seqLen
        "stopTime": 300,
        "maxParallelism": limit.concurrency,//Int
        "minParallelism": 1 //Int
    }

    let preFunctions = []

    pre.forEach((funcs, i) => {

        preFunctions.push({
            "name": funcs.function.name,
            "arrivalRate":  funcs.metrics.arrivalRate - condActionArrivalRate ,
            "avgDuration": funcs.metrics.duration / 1000,
            "memory": funcs.function.limits.memory
        })
        avgColdStartRate += funcs.metrics.coldStartsRate
        avgColdStartDuration += funcs.metrics.coldStartDuration / 1000
/*
        if (i == 0) {
            preFunctions[0].arrivalRate = condActionArrivalRate > 0 ? condActionArrivalRate : funcs.metrics.arrivalRate
        }*/
    });

    message.original.functions = preFunctions
    message.original.num = preFunctions.length
    message.original.avgColdStartRate = avgColdStartRate != null && avgColdStartRate != undefined && avgColdStartRate > 0 ? avgColdStartRate / preFunctions.length : 0.0
    message.original.avgColdStartDuration = avgColdStartDuration != null && avgColdStartRate != undefined && avgColdStartDuration > 0 ? avgColdStartDuration + 2000 : 2500
    message.original.avgColdStartDuration = message.original.avgColdStartDuration / 1000


    const postFunctions = []
    avgColdStartRate = 0.0
    avgColdStartDuration = 0.0

    post.forEach((funcs,i) => {

        postFunctions.push({
            "name": funcs.function.name,
            "arrivalRate": funcs.metrics.arrivalRate,
            "avgDuration": funcs.metrics.duration / 1000,
            "memory": funcs.function.limits.memory
        })
        avgColdStartRate += funcs.metrics.coldStartsRate
        avgColdStartDuration += funcs.metrics.coldStartDuration

        if (i == 0 && post.length > 1) {
            preFunctions[0].arrivalRate = condActionArrivalRate > 0 ? condActionArrivalRate : funcs.metrics.arrivalRate
        }
    });

    message.name = message.name + period
    message.optimized.functions = postFunctions
    message.optimized.num = postFunctions.length
    message.optimized.avgColdStartRate = avgColdStartRate != null && avgColdStartRate != undefined && avgColdStartRate > 0 ? avgColdStartRate / postFunctions.length : 0.0
    message.optimized.avgColdStartDuration = avgColdStartDuration != null && avgColdStartRate != undefined && avgColdStartDuration > 0 ? avgColdStartDuration + 2000 : 2500
    message.optimized.avgColdStartDuration = message.optimized.avgColdStartDuration / 1000

    return message;
}

module.exports = { sendToKafka,receiveFromComputeAndSend,buildMessageSimulationOptimization, init }