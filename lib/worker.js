"use strict";

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const Promise = require('bluebird');
const _ = require('lodash');
const parseError = require('error_parser');

/* Express middleware */
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const expressSession = require('express-session');
const expressBunyan = require('express-bunyan-logger');


module.exports = function(context) {
    const logger = context.logger;
    const cluster = context.cluster;
    const config = context.sysconfig;
    const routes = require('./routes');
    const elasticSession = require('./sessions')(context, expressSession);
    const compression = require('compression');
    const app = module.exports = express();
    let canShutDown = true;
    let server;

    module.exports.app = app;

    function setupMiddleware(){
        return Promise.resolve()
            .then(() => {
                app.set('port', config.teraserver.port);
                //app.use(express.favicon());
                app.set('view engine', 'ejs');

                app.use(compression());
                app.use(bodyParser.urlencoded({extended: false}));
                app.use(bodyParser.json());
                app.use(methodOverride('X-HTTP-Method-Override'));
                app.use(cookieParser('u6u4LpzQrJ8VZwdcfbO5'));

                app.use((req, res, next) => {
                    logger.info('Request for ' + req.originalUrl);
                    next();
                });

                // Access logger must be defined early
                app.use(expressBunyan({
                    logger: logger,
                    excludes: ['req', 'res', 'req-headers', 'res-headers', 'user-agent', 'response-hrtime']
                }));

                if (config.teraserver.elasticsearch_sessions) return elasticSession.initialize();
                return true;
            })
            .then((sessionStore) => {
                //TODO need to put a block to session creation when using a api token
                const sessionConfig = {
                    secret: "HzCbR6WYcMuvG5tou82r",
                    resave: false,
                    saveUninitialized: false
                };
                if (typeof sessionStore === 'function') {
                    logger.info("Configuring for session storage in elasticsearch.");
                    sessionConfig.store = new sessionStore()
                }
                app.use(expressSession(sessionConfig));
            })
    }

    function setRoutes(plugins) {
        //Must go before all routes
        app.use(isProcessing());
        return Promise.resolve()
            .then(() => plugins.notify('routes'))
            .then(() => {
                app.use(routes);
                // Error logger must go after the routing setup
                app.use(expressBunyan.errorLogger({logger: logger}));
                // General error handler so that we don't just throw stack traces that reveal details
                // about the app.
                app.use(errorHandler);
                return true;
            })
    }

    function initialize(){
        const plugins = require('./plugins')(context, app, express);

        Promise.resolve()
            .then(() => setupMiddleware())
            .then(() =>  plugins.notify('init'))
            .then(() =>  plugins.notify('pre'))
            .then(() =>  setRoutes(plugins))
            .then(() =>  plugins.notify('post'))
            .then(() => setupServer())
            .catch(err => {
                const errMsg = parseError(err);
                logger.error(`Could not set up worker, error: ${errMsg}`)
                logger.flush()
                    .then(() => process.exit())
            })
    }

    function setupServer() {
        if (fs.existsSync(config.teraserver.ssl_path + '/key.pem')) {
            var options = {
                key: fs.readFileSync(config.teraserver.ssl_path + '/key.pem'),
                cert: fs.readFileSync(config.teraserver.ssl_path + '/cert.pem'),
                ca: fs.readFileSync(config.teraserver.ssl_path + '/gd_bundle-g2-g1.crt')
            };

            logger.info('Starting in SSL mode');

            server = https.createServer(options, app);
            server.listen(app.get('port'), function() {
                logger.info('Express server listening on port ' + app.get('port') + ' worker ' + cluster.worker.id);
            })
        } else {
            server = http.createServer(app);

            server.listen(app.get('port'), function() {
                logger.info('Express server listening on port ' + app.get('port') + ' worker ' + cluster.worker.id);
            });
        }
    }

    const graceful = _.once(gracefulShutDown);

    process.on('SIGTERM', graceful);
    process.on('SIGINT', graceful);

    function gracefulShutDown() {
        //setting default to 60 seconds
        let counter;

        if (config.teraserver.shutdown_timeout) {
            counter = config.teraserver.shutdown_timeout;
        }
        else {
            counter = 60;
        }

        //this will prevent incoming request on all processes, and shutdown all processes that are not busy
        if (server){
            server.close(function() {
                logger.info(`Worker: ${cluster.worker.id} , pid: ${process.pid} is now shutting down.`);
                logger.flush()
                    .then(() => process.exit())
            });
        }

        //there may be a delay to server.close after finishing a response, adding in safe guards and quick exit
        setInterval(function() {
            if (canShutDown || counter <= 0) {
                logger.info('Worker: ' + cluster.worker.id + ' , pid: ' + process.pid + ' has finished.' +
                    ' Final shutdown will now occur.');
                logger.flush()
                    .then(() => process.exit())
            }
            logger.info('Worker: ' + cluster.worker.id + ' , pid: ' + process.pid + ' is still processing. ' +
                'Will force shutdown in ' + counter + ' seconds');
            counter--;

        }, 1000);
    }


    function isProcessing() {
        var work = 0;
        return function(req, res, next) {
            work++;
            canShutDown = false;

            req.on('close', function() {
                work--;
                if (work === 0) {
                    canShutDown = true;
                }
            });

            res.on('finish', function() {
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
            return;
        }
        // respond with 500 "Internal Server Error".
        res.status(500).json({error: err.message});
        next();
    }

    initialize();
};
