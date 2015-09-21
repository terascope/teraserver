'use strict';
var schema = {

    shutdown_timeout: {
        doc: '',
        default: 60
    },

    workers: {
        doc: "",
        default: 1
    },

    port: {
        doc: '',
        default: 8000
    },

    ssl_path: {
        doc: '',
        default: '/app/config/ssl'
    },

    redis_sessions: {
        doc: '',
        default: '127.0.0.1'
    },

    plugins: {
        doc: '',
        default: ['teranaut']
    },

    plugins_path: {
        doc: 'Location of service plugins',
        default: '/app/api/plugins'
    },

    static_assets: {
        doc: 'Location of static HTTP assets',
        default: '/app/api/public'
    },

    log: {
        doc: '',
        default: ''
    }

};

//redis_sessions

function config_schema(config) {
    var config = config;
    //TODO do something with config if needed

    return schema;
}

module.exports = {
    config_schema: config_schema,
    schema: schema
};