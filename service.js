'use strict';

const worker = require('./lib/worker');
const configSchema = require('./system_schema').config_schema;
const pluginSchema = require('./system_schema').plugin_schema;

require('terafoundation')({
    name: 'teraserver',
    worker,
    config_schema: configSchema,
    plugin_schema: pluginSchema
});
