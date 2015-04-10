'use strict';

var domain = require('domain');
var primary = domain.create();
var logger = require('./lib/logging').logger;

// Domain emits 'error' when it's given an unhandled error
primary.on('error', function(err) {
    logger.error(err.stack);
    process.exit(-1);
});

primary.run(function() {
    var cluster = require('cluster');
    
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
});
