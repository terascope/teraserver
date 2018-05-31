'use strict';

const _ = require('lodash');

module.exports = (customConfig) => {
    const worker = require('./lib/worker');
    const { configSchema } = require('./system_schema');

    const config = {
        name: 'teraserver',
        worker
    };
    _.merge(config, customConfig);
    // teraserver already pulls in schema from plugins, this should not be overwritten
    config.config_schema = configSchema;
    require('terafoundation')(config);
};
