'use strict';

var logger = require('winston');
var config = require('./sysconfig');

logger.add(logger.transports.File, {
    filename: config.api.log_error,
    json: false
});

exports.logger = logger;