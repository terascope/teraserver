'use strict';

const _ = require('lodash');

module.exports = (customConfig) => {
    const worker = require('./lib/worker');
    const configSchema = require('./system_schema').config_schema;
    const pluginSchema = require('./system_schema').plugin_schema;

    const config = {
        name: 'teraserver',
        worker,
        config_schema: configSchema,
        plugin_schema: pluginSchema
    };

    _.merge(config, customConfig);

    require('terafoundation')(config);
};
