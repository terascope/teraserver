'use strict';

const _ = require('lodash');
const { getPlugin } = require('./lib/utils');

const schema = {
    shutdown_timeout: {
        doc: 'seconds util force shutdown will occur when exiting the app',
        default: 60
    },
    port: {
        doc: 'port which the server will listen to',
        default: 8000
    },
    ssl_path: {
        doc: 'path to directory where the ssl certs are located',
        default: '/app/config/ssl'
    },
    elasticsearch_sessions: {
        doc: 'enable elasticsearch sessions',
        default: true
    },
    ttl: {
        doc: 'session time to live duration',
        default: 1000 * 60 * 60 * 24
    },
    plugins: {
        names: {
            doc: 'list of plugins that will be uploaded into TeraServer',
            default: ['teranaut']
        },
        path: {
            doc: 'Location of service plugins',
            default: '/app/api/plugins'
        }
    },
    static_assets: {
        doc: 'Location of static HTTP assets',
        default: '/app/api/public'
    },
    name: {
        doc: 'Name for the cluster itself, its used for naming log files/indices',
        default: 'teraserver',
        format: (val) => {
            if (val && typeof val !== 'string') {
                throw new Error('This field is required and must by of type string');
            }
        },
    },
    connection: {
        doc: 'Elasticsearch cluster where session state is stored',
        default: 'default',
        format(val) {
            if (typeof val !== 'string') {
                throw new Error('connection parameter must be of type String as the value');
            }
        }
    },
    request_timeout: {
        doc: 'How long in milliseconds HTTP requests will wait before timing out.',
        default: 120000
    },
};

function getPluginSchema(plugin) {
    let pluginSchemaDict = {};

    if (plugin.config_schema) {
        if (typeof plugin.config_schema === 'function') {
            pluginSchemaDict = plugin.config_schema();
        } else if (typeof plugin.config_schema === 'object') {
            pluginSchemaDict = plugin.config_schema;
        }
    }
    return pluginSchemaDict;
}

function pluginSchema(config) {
    const schemaDict = {};
    const { plugins } = config.teraserver;

    if (plugins && plugins.names.length > 0) {
        plugins.names.forEach((name) => {
            const plugin = getPlugin(name, config);
            schemaDict[name] = getPluginSchema(plugin);
        });
    }

    return schemaDict;
}

function configSchema(config) {
    const paritialSchema = pluginSchema(config);
    return _.merge({ teraserver: schema }, paritialSchema);
}

module.exports = {
    configSchema,
    schema
};
