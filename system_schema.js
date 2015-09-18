'use strict';
var schema = {
    /*   teranaut = {};
     config.teranaut.auth = {};
     config.teranaut.auth.open_signup = true;
     config.teranaut.auth.require_email = true;*/


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

    redis_ip: {
        doc: '',
        default: '127.0.0.1'
    },

    plugins: {
        doc: '',
        default: ['teranaut']
    },

// Location of service plugins
    plugins_path: {
        doc: '',
        default: '/app/api/plugins'
    },

// Location of static HTTP assets.
    static_assets: {
        doc: '',
        default: '/app/api/public'
    },

    log: {
        doc: '',
        default: '/app/logs/api.log'
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