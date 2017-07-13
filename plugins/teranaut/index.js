'use strict';

var fs = require('fs');
var crypto = require("crypto");
var teranaut_schema = require('./schema');
var getPlugin = require('../../lib/utils').getPlugin;


var logger, models, baucis, config, passport, userModel, teranaut;


var api = {
    _config: undefined,

    config_schema: function() {
        return teranaut_schema;
    },

    config: function(pluginConfig) {
        this._config = pluginConfig;
        logger = pluginConfig.logger;
        baucis = pluginConfig.baucis;
        passport = pluginConfig.passport;
        config = pluginConfig.server_config;
        teranaut = pluginConfig.server_config.teranaut;

        var modelConfig = {
            mongoose: pluginConfig.mongodb,
            logger: logger
        };

        if (teranaut.models) {
            models = getPlugin(teranaut.models, config)(modelConfig);
        }
        else {
            models = require('./server/models')(modelConfig);
        }

        if (teranaut.auth.user_model) {
            userModel = models[teranaut.auth.user_model];
        }
        else {
            userModel = models.User;
        }

    },

    static: function() {
        return __dirname + '/static';
    },

    init: function() {

        if (!(teranaut && teranaut.models)) {
            // Configure Baucis to know about the application models
            require('./server/api/baucis')(this._config);
        }

        passport.use(userModel.createStrategy());
        passport.serializeUser(userModel.serializeUser());
        passport.deserializeUser(userModel.deserializeUser());
    },

    pre: function() {
        this._config.app.use(passport.initialize());
        this._config.app.use(passport.session());
    },

    routes: function(deferred) {
        // Login function to generate an API token
        this._config.app.use('/api/v1/token', login);
        this._config.app.use('/api/v1/login', login);

        // All API endpoints require authentication
        this._config.app.use('/api/v1', ensureAuthenticated);

        if (config.teranaut.ui) {
            var url_base = this._config.url_base;

            var index = function(req, res) {
                res.header("Cache-Control", "no-cache, no-store, must-revalidate");
                res.header("Pragma", "no-cache");
                res.header("X-Frame-Options", "Deny");

                res.sendfile('index.html', {root: __dirname + '/static'});
            };

            this._config.app.get(url_base, function(req, res) {
                res.redirect(url_base + '/_'); // redirecting to a path handled by /* path below
            });

            this._config.app.get(url_base + '/', index);
            this._config.app.get(url_base + '/*', index);

            // TODO: this is directly hooking to the alias which is making an assumption
            // about the URL space. This ability probably should be moved into teraserver.
            this._config.app.get('/pl/' + config.teranaut.ui + '/', index);
            this._config.app.get('/pl/' + config.teranaut.ui + '/*', index);
        }

        // THIS needs to be deferred until after all plugins have had a chance to load
        var plugin_config = this._config;
        deferred.push(function() {
            plugin_config.app.use('/api/v1', baucis());
        });

        this._config.app.post('/login', passport.authenticate('local'), function(req, res) {
            res.status(200).send('login successful');
        });

        this._config.app.get('/logout', function(req, res) {
            req.logout();
            res.status(200).send('logout successful');
        });
    },

    post: function() {

    }
};

var ensureAuthenticated = function(req, res, next) {
    // We allow creating new accounts without authentication.
    if (teranaut.auth.open_signup) {
        // TODO: THIS URL should depend on the name of the model
        if (req.url === '/accounts' && req.method === 'POST') return next();
    }

    // See if the session is authenticated
    if (req.isAuthenticated()) {
        return next();
    }
    // API auth based on tokens
    else if (req.query.token) {
        userModel.findOne({api_token: req.query.token}, function(err, account) {
            if (err) {
                throw err;
            }

            if (account) {
                req.user = account;

                // If there's redis session storage available we add the login to the session.
                if (config.teraserver.redis_sessions) {
                    req.logIn(account, function(err) {
                        if (err) {
                            return next(err);
                        }

                        return next();
                    });
                }
                else {
                    return next();
                }
            }
            else {
                return res.status(401).json({error: 'Access Denied'});
            }
        })
    }
    else {
        // For session based auth
        return res.status(401).json({error: 'Access Denied'});
    }
};

var login = function(req, res, next) {

    passport.authenticate('local', {session: false}, function(err, user, info) {

        if (err) {
            return next(err);
        }

        if (!user) {

            return res.status(401).json({error: info.message});
        }

        if (teranaut.auth.require_email && !user.email_validated) {
            return res.status(401).json({error: 'Account has not been activated'});
        }

        req.logIn(user, function(err) {
            if (err) {
                return next(err);
            }

            var shasum = crypto.createHash('sha1');
            var date = Date.now();
            crypto.randomBytes(128, function(err, buf) {
                if (err) {
                    logger.error("Error generating randomBytes on User save.");
                    return next(err);
                }

                shasum.update(buf + Date.now() + user.hash + user.username);
                var token = shasum.digest('hex');
                user.api_token = token;
                user.save();
                res.json({
                    token: token,
                    date: date,
                    id: user._id
                });
            });
        });
    })(req, res, next);
};

module.exports = api;
