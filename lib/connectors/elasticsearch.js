'use strict';

module.exports = function(config, logger) {
    var elasticsearch = require('elasticsearch');

    var client = new elasticsearch.Client({
        host:                 config.elasticsearch.ip,
        sniffOnStart:         config.elasticsearch.sniffOnStart,
        sniffInterval:        config.elasticsearch.sniffInterval,
        sniffOnConnectionFault: config.elasticsearch.sniffOnConnectionFault,
        requestTimeout:       config.elasticsearch.requestTimeout,
        deadTimeout:          config.elasticsearch.deadTimeout,
        maxRetries:           config.elasticsearch.maxRetries
    });

    return client;
}