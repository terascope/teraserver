'use strict';

var config = require('./sysconfig');

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

module.exports = client;