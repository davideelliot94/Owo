var log4js = require("log4js");
var logger = log4js.getLogger();


function logInfo(mex){
    logger.level = "info";
    logger.info(mex);
}

function logWarn(mex){
    logger.level = "warn";
    logger.warn(mex);
}

function logDebug(mex){
    logger.level = "debug";
    logger.debug(mex);
}

function logError(mex){
    logger.level = "error";
    logger.error(mex);
}

function log(mex,kind){
    switch (kind) {

        case "info":
            logInfo(mex);
            break;

        case "error":
            logError(mex);
            break;

        case "debug":
            logDebug(mex);
            break;

        case "warn":
            logWarn(mex);
            break;

        default:
            logWarn(mex);
            break;
    }
}

module.exports = {log};
