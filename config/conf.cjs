const config = require('config');
const https = require('https');

const HTTPS_AGENT = new https.Agent({rejectUnauthorized: false});

/**
 * DOCKER HUB
 */

const DOCKER_HUB_USERNAME = process.env.DOCKER_HUB_USERNAME === undefined ? config.get("docker_hub.username"):process.env.DOCKER_HUB_USERNAME ;
const DOCKER_HUB_PASSWORD = process.env.DOCKER_HUB_PASSWORD 
const DOCKER_BASE_IMG = config.get("docker_hub.img_name");
const DOCKER_IMG_FULL = DOCKER_HUB_USERNAME + "/" + DOCKER_BASE_IMG

/**
 * ENDPOINTS
 */

const PORT = config.get('default.port');
const API_HOST = process.env.API_HOST != undefined ? process.env.API_HOST:config.get('openwhisk.apihost')+":"+config.get('openwhisk.port');
const METRICS_ENDPOINT = process.env.METRICS_ENDPOINT != undefined ? process.env.METRICS_ENDPOINT:config.get("openwhisk.metrics_endpoint");

/**
 * METRICS
 */

 const METRICS = [
    {"name":"duration","url":'http://'+METRICS_ENDPOINT+'query=max(rate(openwhisk_action_duration_seconds_sum{action="$__action"}[$__range])/rate(openwhisk_action_duration_seconds_count{action="$__action"}[$__range]) > 0)'},
    {"name":"waitTime","url":'http://'+METRICS_ENDPOINT+'query=max(rate(openwhisk_action_waitTime_seconds_sum{action="$__action"}[$__range])/rate(openwhisk_action_waitTime_seconds_count{action="$__action"}[$__range]) > 0)'},
    {"name":"initTime","url":'http://'+METRICS_ENDPOINT+'query=max(rate(openwhisk_action_initTime_seconds_sum{action="$__action"}[$__range])/rate(openwhisk_action_initTime_seconds_count{action="$__action"}[$__range]) > 0)'},
    {"name":"status","url":'http://'+METRICS_ENDPOINT+'query=increase(openwhisk_action_status{action="$__action",status=\"success\"}[$__range])'},
    {"name":"coldStarts","url":'http://'+METRICS_ENDPOINT+'query=increase(openwhisk_action_coldStarts_total{action="$__action"}[$__range])'}
]

/**
 * UTILS
 */
const ENVIRONMENT = process.env.ENVIRONMENT != undefined ? process.env.ENVIRONMENT : "standalone environment";
const KINDS = config.get('openwhisk.kinds');
const API_KEY=config.get('openwhisk.apikey');
const LIMITS = config.get("openwhisk.system.limits") != undefined ? config.get("openwhisk.system.limits"):{} ;
const IS_SIMULATION = config.get("simulation") != undefined ? config.get("simulation"):false;

/**
 * KAFKA
 */
const KAFKA_TOPIC_PRODUCE = config.get("kafka.topic.produce") != undefined ? config.get("kafka.topic.produce"):"TEST1";
const KAFKA_TOPIC_CONSUME = config.get("kafka.topic.consume") != undefined ? config.get("kafka.topic.consume"):"TEST2";
const KAFKA_BOOTSTRAP_SERVER = process.env.KAFKA_BOOTSTRAP_BROKER != undefined ? process.env.KAFKA_BOOTSTRAP_BROKER : config.get("kafka.boostrap_server");

module.exports =  
                {
                    API_HOST,
                    API_KEY,
                    PORT,
                    ENVIRONMENT,
                    KINDS,
                    METRICS_ENDPOINT,
                    METRICS,
                    LIMITS,
                    IS_SIMULATION,
                    KAFKA_TOPIC_PRODUCE,
                    KAFKA_TOPIC_CONSUME,
                    KAFKA_BOOTSTRAP_SERVER,
                    HTTPS_AGENT,
                    DOCKER_HUB_USERNAME,
                    DOCKER_HUB_PASSWORD,
                    DOCKER_BASE_IMG,
                    DOCKER_IMG_FULL
                }