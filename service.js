var worker = require('./lib/worker');
var config_schema = require('./system_schema').config_schema;

var foundation = require('terafoundation')({
    name: 'TeraServer',
    baucis: true,
    worker: worker,
    config_schema: config_schema
});
