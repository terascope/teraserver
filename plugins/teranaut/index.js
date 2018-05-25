'use strict';

const teranaut_schema = require('./schema');
const Promise = require('bluebird');
const Strategy = require('passport-local').Strategy;
const parseError = require('error_parser');
const _ = require('lodash');
let logger, context, router, config, passport, teranaut, userStore, teraSearchApi;

const api = {
    _config: undefined,
    config_schema: () => {
        return teranaut_schema;
    },
    config: (pluginConfig) => {
        this._config = pluginConfig;
        context = pluginConfig.context;
        logger = pluginConfig.logger;
        passport = pluginConfig.passport;
        config = pluginConfig.server_config;
        teranaut = pluginConfig.server_config.teranaut;
        router = pluginConfig.express.Router();
        teraSearchApi = pluginConfig.search(pluginConfig, 'created')
    },
    static: () => __dirname + '/static',
    init: () => {
        return Promise.resolve()
            .then(() => require('./server/store/users')(context))
            .then(_userStore => {
                userStore = _userStore;

                passport.use(new Strategy(
                    function(username, password, done) {
                        if (!username || !password) return done(null, false);
                        userStore.authenticateUser(username, password)
                            .then((user) => {
                                if (!user) return done(null, false);
                                return done(null, user);
                            })
                            .catch(err => done(err));
                    }));

                passport.serializeUser(userStore.serializeUser);
                passport.deserializeUser(userStore.deserializeUser);
            })
    },
    pre: () => {
        this._config.app.use(passport.initialize());
        this._config.app.use(passport.session());
    },
    routes: (deferred) => {
        // Login function to generate an API token
        this._config.app.use('/api/v1/token', login);
        this._config.app.use('/api/v1/login', login);

        // All API endpoints require authentication
        this._config.app.use('/api/v1', ensureAuthenticated);

        require('./server/api/user')(router, userStore, logger, teraSearchApi);

        if (config.teranaut.ui) {
            const url_base = this._config.url_base;
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
        const plugin_config = this._config;

        deferred.push(function() {
            plugin_config.app.use('/api/v1', router);
        });

        this._config.app.post('/login', passport.authenticate('local'), function(req, res) {
            res.status(200).send('login successful');
        });
        this._config.app.get('/logout', function(req, res) {
            req.logout();
            res.status(200).send('logout successful');
        });
    },
    post: () => {}
};

function index(req, res) {
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    res.header("Pragma", "no-cache");
    res.header("X-Frame-Options", "Deny");
    res.sendfile('index.html', {root: __dirname + '/static'});
}

function ensureAuthenticated(req, res, next) {
    // We allow creating new accounts without authentication.
    const token = req.query.token;
    if (teranaut.auth.open_signup) {
        if (req.url === '/accounts' && req.method === 'POST') return next();
    }
    // See if the session is authenticated
    if (req.isAuthenticated()) {
        return next();
    }
    // API auth based on tokens
    else if (token) {
        userStore.findByToken(token)
            .then((account) => {
                if (account) {
                    req.user = account;
                    // If there's elasticsearch session storage available we add the login to the session.
                    if (config.teraserver.elasticsearch_sessions) {
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
            .catch((err) => next(new Error(err)))
    }
    else {
        // For session based auth
        return res.status(401).json({error: 'Access Denied'});
    }
}

function login(req, res, next) {
    passport.authenticate('local', { session: false }, function(err, user, info) {
        if (err) return next(err);
        if (!user) res.status(401).json({ error: _.get(info, 'message', 'no user was found') });
        if (teranaut.auth.require_email && !user.email_validated) {
            return res.status(401).json({ error: 'Account has not been activated' });
        }

        req.logIn(user, function(err) {
            if (err) return next(err);

            userStore.createApiTokenHash(user)
                .then((hashedUser) => userStore.updateToken(hashedUser))
                .then((hashedUser) => {
                    res.json({
                        token: hashedUser.api_token,
                        date: hashedUser.updated,
                        id: hashedUser.id
                    });
                })
                .catch((err) => {
                    const errMsg = parseError(err);
                    logger.error(`error while creating new token and updating user, error:${errMsg}`)
                    res.status(401).json({ error: 'error while creating new token and updating user' });
                });
        });
    })(req, res, next);
}

module.exports = api;
