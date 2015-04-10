'use strict';

module.exports = function(config, logger) {
    var mongoose = require("mongoose");

    var servers = [];

    var serverConfig = { 
        server: { 
            auto_reconnect: true,
            socketOptions: { keepAlive: 1, connectTimeoutMS: 30000 }
        } 
    };

    if (config.mongodb.replicaSet) {
        serverConfig.replset = { 
            rs_name: config.mongodb.replicaSet,
            socketOptions: { 
                keepAlive: 1,
                connectTimeoutMS : config.mongodb.replicaSetTimeout 
            },
            readPreference: 'secondaryPreferred'
        };
    }

    mongoose.connect(config.mongodb.servers, serverConfig, function(error) {
        if (error) {
            logger.error("Could not connect to Mongo DB: " + error);
        }
    });

    mongoose.connection.on('error', function(err) {
        logger.error("Error from mongodb: " + err);
    });

    mongoose.connection.on('reconnected', function () {
        logger.error('Error: mongo connection dropped. Automatically reconnected.');
    });

    return mongoose;    
}
