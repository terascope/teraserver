/*
 If teraserver is loaded as a module we can still initialize while giving the app
 finer control over what services are loaded.
 */

var _ = require('lodash');

module.exports = function(customConfig) {
    var worker = require('./lib/worker');
    var config_schema = require('./system_schema').config_schema;
    var plugin_schema = require('./system_schema').plugin_schema;


    var config = {
        name: 'teraserver',
        worker: worker,
        config_schema: config_schema,
        plugin_schema: plugin_schema
    };

    _.merge(config, customConfig);

    var foundation = require('terafoundation')(config);
};
