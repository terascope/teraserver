/**
 * Module dependencies.
 */
var express = require('express');
var http = require('http');
var https = require('https');
var fs = require('fs');

/* Express middleware */
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');
var RedisStore = require('connect-redis')(expressSession);
var expressBunyan = require('express-bunyan-logger');

var _ = require('lodash');

module.exports = function (context) {
    var logger = context.logger;
    var cluster = context.cluster;
    var config = context.sysconfig;
    var routes = require('./routes');
    var canShutDown = true;

    if (context.redis && context.redis.default) var redis_client = context.redis.default;

    var app = module.exports = express();
    module.exports.app = app;

    app.set('port', config.api.port || 3000);

    //app.use(express.favicon());
    app.set('view engine', 'ejs');

    app.use(bodyParser.urlencoded({extended: false}));
    app.use(bodyParser.json());
    app.use(methodOverride('X-HTTP-Method-Override'));
    app.use(cookieParser('u6u4LpzQrJ8VZwdcfbO5'));

    var plugins = require('./plugins')(context, app, express);

    var sessionConfig = {
        secret: "HzCbR6WYcMuvG5tou82r",
        resave: false,
        saveUninitialized: false
    };

    if (config.teraserver && config.teraserver.redis_sessions) {
        logger.info("Configuring for session storage in Redis.");
        sessionConfig.store = new RedisStore({
            client: redis_client
        });
    }

    app.use(expressSession(sessionConfig));

    // Plugin pre hook point
    plugins.notify('pre');

    // Access logger must be defined early
    app.use(expressBunyan({
        logger: logger,
        excludes: ['req', 'res', 'req-headers', 'res-headers', 'user-agent', 'response-hrtime']
    }));

    //Must go before all routes
    app.use(isProcessing());

    // Tell the plugins to load their routes
    plugins.notify('routes');

    app.use(routes);

    // Error logger must go after the routing setup
    app.use(expressBunyan.errorLogger({logger: logger}));
    // General error handler so that we don't just throw stack traces that reveal details
    // about the app.
    app.use(errorHandler);

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

        server.listen(app.get('port'), function () {
            logger.info('Express server listening on port ' + app.get('port') + ' worker ' + cluster.worker.id);
        });
    }

    // TODO: see if this is really the right place for this
    plugins.notify('post');

    process.on('SIGTERM', gracefulShutDown);

    process.on('SIGINT', gracefulShutDown);

    function gracefulShutDown() {
        var counter = 30;
        if (canShutDown) {
            logger.info("Process is shutting down: ", process.pid);
            process.exit();
        }
        else {
            logger.info("Process is still running: ", process.pid);
            setInterval(function () {
                if (canShutDown || counter <= 0) {
                    process.exit();
                }
                logger.info('Process will shutdown no later than ' + counter + ' seconds');
                counter--;

            }, 1000);

        }
    }


    function isProcessing() {
        var work = 0;
        return function (req, res, next) {
            work++;
            canShutDown = false;

            res.on('finish', function () {
                work--;
                if (work === 0) {
                    canShutDown = true;
                }
            });
            next();
        }
    }

    function errorHandler(err, req, res, next) {
        // log it
        logger.error(err.stack);

        if (err.errors) {
            var message = '';

            var errors = _.keys(err.errors);
            for (var i = 0; i < errors.length; i++) {
                message = message + err.errors[errors[i]].message;
            }

            res.status(500).json({error: message});
            next();
        }
        // respond with 500 "Internal Server Error".
        res.status(500).json({error: err.message});
        next();

    }
};