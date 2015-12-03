'use strict';

var fs = require('fs');

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

    redis_sessions: {
        doc: 'enable redis sessions',
        default: true
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


function getPlugin(name, configPath) {
    var localPluginPath = __dirname + '/plugins';
    var teraPluginPath = fs.readdirSync(localPluginPath);
    var inPluginsDir = teraPluginPath.indexOf(name) !== -1;
    var plugin;

    if (inPluginsDir) {
        try {
            var plugin = require(localPluginPath + '/' + name);
            return getPluginSchema(plugin);
        }
        catch (e) {
            console.log('Error getting plugin from local plugin directory')
        }
    }
    else {
        try {
            var plugin = (configPath + '/' + name);
            return getPluginSchema(plugin);

        }
        catch (e) {
            console.log('Error getting plugin from path specified in configs ');
        }
    }
}


function plugin_schema(config) {
    var schema = {};

    var plugins = config.teraserver.plugins;
    var configPluginPath;

    if (plugins && plugins.names.length > 0) {
        configPluginPath = plugins.path;

        plugins.names.forEach(function(name) {
            schema[name] = getPlugin(name, configPluginPath)
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