'use strict';

var cluster = require('cluster');
var winston = require('winston');
var expressWinston = require('express-winston');

var logger = require('./lib/logging').logger;

process.on('uncaughtException', function(err) {
    logger.error((new Date).toUTCString() + ' uncaughtException:', err.message);
    // There is difficulty in getting these messages to reflect in the log file. The callback 
    // here works in dev but may not be 100% reliable.
    logger.error(err.stack, function() {
        process.exit(1);    
    });
})

/**
 * Use cluster to start multiple workers 
 */
if (cluster.isMaster) {
    require('./lib/master')(cluster, logger);
}
else {
    require('./lib/worker')(cluster, logger);    
}    

