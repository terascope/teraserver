'use strict';

const worker = require('./lib/worker');
const { configSchema } = require('./system_schema');


require('terafoundation')({
    name: 'teraserver',
    worker,
    config_schema: configSchema
});

