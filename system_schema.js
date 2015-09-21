'use strict';
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
        doc: 'redis port',
        default: '127.0.0.1'
    },

    plugins: {
        doc: 'list of plugins that will be uploaded into TeraServer',
        default: ['teranaut']
    },

    plugins_path: {
        doc: 'Location of service plugins',
        default: '/app/api/plugins'
    },

    static_assets: {
        doc: 'Location of static HTTP assets',
        default: '/app/api/public'
    }

};


function config_schema(config) {
    var config = config;
    //TODO do something with config if needed

    return schema;
}

module.exports = {
    config_schema: config_schema,
    schema: schema
};