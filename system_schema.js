'use strict';

var fs = require('fs');
var getPlugin = require('./lib/utils').getPlugin;

var schema = {
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
        default: 1000 * 60 * 60
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
    }
};

function getPluginSchema(plugin) {
    var pluginSchema = {};

    if (plugin.config_schema) {
        if (typeof plugin.config_schema === 'function') {
            pluginSchema = plugin.config_schema();
        }
        else if (typeof plugin.config_schema === 'object') {
            pluginSchema = plugin.config_schema;
        }
    }
    return pluginSchema;
}

function plugin_schema(config) {
    var schema = {};
    var plugins = config.teraserver.plugins;

    if (plugins && plugins.names.length > 0) {

        plugins.names.forEach(function(name) {
            var plugin =  getPlugin(name, config);
            schema[name] = getPluginSchema(plugin);
        });
    }

    return schema;
}

function config_schema(config) {
    return schema;
}

module.exports = {
    config_schema: config_schema,
    plugin_schema: plugin_schema,
    schema: schema
};