'use strict';

var bunyan = require('bunyan');
var expressBunyan = require('express-bunyan-logger');
var config = require('./sysconfig');

var log_config = { 
    name: 'AgriServer'
}

if (config.environment === 'production') {
    log_config.streams = [        
        {
            level: 'info',
            path: config.api.log  // log ERROR and above to a file
        }
    ]
}

var logger = bunyan.createLogger(log_config);

var api = {
    httpAccessLogger: expressBunyan( { logger: logger, excludes: ['req', 'res', 'req-headers', 'res-headers', 'user-agent', 'response-hrtime'] } ),
    httpErrorLogger: expressBunyan.errorLogger({ logger: logger }),
    logger: logger
}

module.exports = api;