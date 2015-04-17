/* 
 ********************************************************
 Framework configuration defaults. 

 These can be overridden by a service local config.js
 ********************************************************
*/

var config = {};

/*
 Application environment.
 */

config.environment = 'development';

/*
 ***********************
 MongoDB Configuration
 ***********************
 */
config.mongodb = {}

config.mongodb.default = {
    servers: "mongodb://localhost:27017/watchlist"
}

//config.mongodb.servers = "mongodb://localhost:27017/test";

//config.mongodb.replicaSet = 'app';

//config.mongodb.replicaSetTimeout = 30000;

/*
 ***********************
 Elastic Search Configuration
 ***********************
 */
config.elasticsearch = {};

config.elasticsearch.default = {
    host: ["127.0.0.1:9200"]
};

/*
 ***********************
 StatsD Configuration
 ***********************
 */
config.statsd = {};

config.statsd.default = {
    host: '127.0.0.1',
    mock: false
};

/*
 ***********************
 API Service Configuration
 ***********************
 */
config.api = {};

config.api.workers = 1;

config.api.port = 8000;

config.api.ssl_path = '/app/config/ssl';

config.api.redis_ip = '127.0.0.1';

//config.api.plugins = ['agrinaut', 'agrilogs'];
config.api.plugins = ['teranaut', 'veracity', 'logscope', 'ui' ];

// Location of service plugins
config.api.plugins_path = '/app/api/plugins';

// Location of static HTTP assets. 
config.api.static_assets = '/app/api/public';

config.api.log = '/app/logs/api.log';

module.exports = config;
