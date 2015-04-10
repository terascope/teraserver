/**
 * Module dependencies.
 */
var express = require('express');
var http = require('http');
var https = require('https');
var fs = require('fs');

var _ = require('lodash');
    
module.exports = function(cluster, logger) {
    
    // Load the configuration settings for the application we're going to run
    var config = require("./sysconfig");

    var RedisStore = require('connect-redis')(express)

    var app = module.exports = express();   
    module.exports.app = app;

    app.set('port', config.api.port || 3000);
  
    var plugins = require('./plugins')(app, express, config, logger);

    app.use(express.favicon());    
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser('u6u4LpzQrJ8VZwdcfbO5'));
    
    var session = {
        secret: "HzCbR6WYcMuvG5tou82r"
    };

    if (config.api.redis_ip) {
        logger.info("Configuring for session storage in Redis.");
        session.store = new RedisStore({ 
            host: config.api.redis_ip
        });
    }

    app.use(express.session(session));

    // Access logger must be defined early
    app.use(require('./logging').httpAccessLogger);
    
    // Plugin pre hook point
    plugins.notify('pre');


/*expressWinston.logger({
        transports: [
            new winston.transports.File({
                filename: config.api.log_access,
                json: false
            })
        ],
        meta: false, // optional: control whether you want to log the meta data about the request (default to true)
        msg: "HTTP {{req.method}} {{req.originalUrl}} {{res.statusCode}} {{res.responseTime}}ms" // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}}   {{req.url}}"
    })*/
    // Tell the plugins to load their routes
    plugins.notify('routes')    

    app.use(app.router);

    // Load in the default routes
    var routes = require('./routes');

    // Error logger must go after the router
    app.use(require('./logging').httpErrorLogger);
    
    
    // General error handler so that we don't just throw stack traces that reveal details
    // about the app.
    app.use(errorHandler);

    // development only
    if ('development' == app.get('env')) {
      app.use(express.errorHandler());
    }

    var server;
    if (fs.existsSync(config.api.ssl_path + '/key.pem')) {
        var options = {
            key: fs.readFileSync(config.api.ssl_path + '/key.pem'),
            cert: fs.readFileSync(config.api.ssl_path + '/cert.pem'),
            ca: fs.readFileSync(config.api.ssl_path + '/gd_bundle-g2-g1.crt')
        };
        
        logger.info('Starting in SSL mode');

        server = https.createServer(options, app);
        server.listen(app.get('port'), function () {
            logger.info('Express server listening on port ' + app.get('port') + ' worker ' + cluster.worker.id);    
        })
    } else {
        server = http.createServer(app);

        server.listen(app.get('port'), function() {
            logger.info('Express server listening on port ' + app.get('port') + ' worker ' + cluster.worker.id);
        });
    }    

    // TODO: see if this is really the right place for this
    plugins.notify('post');

    function errorHandler(err, req, res, next) {
        // log it
        logger.error(err.stack);

        //if (err.message == 'Validation failed') {
            if (err.errors) {
                var message = '';

                var errors = _.keys(err.errors);
                for (var i = 0; i < errors.length; i++) {
                    message = message + err.errors[errors[i]].message;
                }

                return res.json(500, { error: message });
            }
        //}
        
        // respond with 500 "Internal Server Error".  
        return res.json(500, { error: err.message });        
    }
}