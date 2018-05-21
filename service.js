var worker = require('./lib/worker');
var config_schema = require('./system_schema').config_schema;
var plugin_schema = require('./system_schema').plugin_schema;

var foundation = require('terafoundation')({
    name: 'teraserver',
    worker: worker,
    config_schema: config_schema,
    plugin_schema: plugin_schema
});
