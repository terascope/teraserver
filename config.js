var config = {};

/*
 ***********************
 MongoDB Configuration
 ***********************
 */
config.mongodb = {}

config.mongodb.servers = "mongodb://localhost:27017/watchlist";

//config.mongodb.servers = "mongodb://172.17.0.9:27017/watchlist,mongodb://172.17.0.10:27017/watchlist,mongodb://172.17.0.11:27017/watchlist";

//config.mongodb.replicaSet = 'app';

//config.mongodb.replicaSetTimeout = 30000;

/*
 ***********************
 Elastic Search Configuration
 ***********************
 */
config.elasticsearch = {};

config.elasticsearch.ip = ["127.0.0.1:9200"];
config.elasticsearch.sniffOnStart = true;
config.elasticsearch.sniffInterval = 30000;
config.elasticsearch.sniffOnConnectionFault = true;
config.elasticsearch.requestTimeout = 120000;
config.elasticsearch.deadTimeout = 30000;
config.elasticsearch.maxRetries = 3;

/*
 ***********************
 StatsD Configuration
 ***********************
 */
config.statsd = {};

config.statsd.ip = '127.0.0.1';
config.statsd.mock = false;


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

config.api.plugins = ['agrinaut', 'agrilogs'];

// Location of service plugins
config.api.plugins_path = '/app/api/plugins';

// Location of static HTTP assets. 
config.api.static_assets = '/app/api/public';


config.api.log_access = '/app/logs/api_access.log';
config.api.log_error = '/app/logs/api_error.log';

module.exports = config;
