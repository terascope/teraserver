'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const { Strategy } = require('passport-local');
const parseError = require('@terascope/error-parser');
const { ACLManager } = require('@terascope/data-access');
const teranautSchema = require('./schema');

let logger;
let context;
let router;
let passport;
let teranaut;
let userStore;
let aclManager;
let teraSearchApi;
let useV1Users;

const api = {
    _config: undefined,
    config_schema: () => teranautSchema,
    config: (pluginConfig) => {
        this._config = pluginConfig;
        ({
            context,
            logger,
            passport,
            server_config: { teranaut }
        } = pluginConfig);
        useV1Users = _.get(teranaut, 'auth.use_v1_users', true);
        router = pluginConfig.express.Router();
        teraSearchApi = pluginConfig.search(pluginConfig, 'created');
    },
    static: () => `${__dirname}/static`,
    init: () => Promise.resolve()
        .then(() => require('./server/store/users')(context))
        .then((_userStore) => {
            userStore = _userStore;
        })
        .then(() => {
            const { connection = 'default', namespace } = context.sysconfig.data_access || {};
            const { client } = context.foundation.getConnection({
                type: 'elasticsearch',
                endpoint: connection,
                cached: true
            });

            aclManager = new ACLManager(client, { namespace, logger });
            return aclManager.initialize();
        })
        .then(() => {
            passport.use(
                new Strategy((username, password, done) => {
                    if (!username || !password) {
                        done(null, false);
                        return;
                    }

                    userStore
                        .authenticateUser(username, password)
                        .then((user) => {
                            if (!user) return done(null, false);
                            return done(null, user);
                        })
                        .catch(err => done(err));
                })
            );

            passport.serializeUser(userStore.serializeUser);
            passport.deserializeUser(userStore.deserializeUser);
        }),
    pre: () => {
        this._config.app.use(passport.initialize());
        this._config.app.use(passport.session());
    },
    routes: (deferred) => {
        logger.info(`Using ${useV1Users ? 'v1' : 'v2'} users for /api/v1`);
        // Login function to generate an API token
        this._config.app.use('/api/v1/token', login);
        this._config.app.use('/api/v1/login', login);

        // All API endpoints require authentication
        this._config.app.use('/api/v1', ensureAuthenticated);

        require('./server/api/user')(router, userStore, logger, teraSearchApi);

        if (teranaut.ui) {
            const { url_base: urlBase } = this._config;
            this._config.app.get(urlBase, (req, res) => {
                res.redirect(`${urlBase}/_`); // redirecting to a path handled by /* path below
            });
            this._config.app.get(`${urlBase}/`, index);
            this._config.app.get(`${urlBase}/*`, index);

            // TODO: this is directly hooking to the alias which is making an assumption
            // about the URL space. This ability probably should be moved into teraserver.
            this._config.app.get(`/pl/${teranaut.ui}/`, index);
            this._config.app.get(`/pl/${teranaut.ui}/*`, index);
        }

        // THIS needs to be deferred until after all plugins have had a chance to load
        const pluginConfig = this._config;

        deferred.push(() => {
            pluginConfig.app.use('/api/v1', router);
        });

        this._config.app.post('/login', passport.authenticate('local'), (req, res) => {
            res.status(200).send('login successful');
        });
        this._config.app.get('/logout', (req, res) => {
            req.logout();
            res.status(200).send('logout successful');
        });
    },
    post: () => {}
};

function index(req, res) {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('X-Frame-Options', 'Deny');
    res.sendFile('index.html', { root: `${__dirname}/static` });
}

function ensureAuthenticated(req, res, next) {
    // We allow creating new accounts without authentication.
    const { token } = req.query;
    if (teranaut.auth.open_signup) {
        if (req.url === '/accounts' && req.method === 'POST') {
            next();
            return;
        }
    }
    // See if the session is authenticated
    if (req.isAuthenticated()) {
        next();
        return;
    }

    // API auth based on tokens
    if (token) {
        if (useV1Users) {
            userStore
                .findByToken(token)
                .then((account) => {
                    if (account) {
                        req.user = account;
                        return next();
                    }
                    return res.status(401).json({ error: 'Access Denied' });
                })
                .catch((err) => {
                    const errMsg = parseError(err);
                    logger.error(errMsg);
                    return res.status(503).json({ error: 'Access Denied' });
                });
        } else {
            aclManager
                .authenticate({ token })
                .then((account) => {
                    req.user = account;
                    req.v2User = account;
                    return next();
                })
                .catch((err) => {
                    if ([401, 403, 404].includes(err.statusCode)) {
                        return res.status(401).json({ error: 'Access Denied' });
                    }
                    logger.error(err, 'Failure authenticating user');
                    return res.status(503).json({ error: 'Access Denied' });
                });
        }
    } else {
        // For session based auth
        res.status(401).json({ error: 'Access Denied' });
    }
}

function login(req, res, next) {
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            next(err);
            return;
        }
        if (!user) {
            res.status(401).json({ error: _.get(info, 'message', 'no user was found') });
            return;
        }
        if (teranaut.auth.require_email && !user.email_validated) {
            res.status(401).json({ error: 'Account has not been activated' });
            return;
        }

        req.logIn(user, (errObj) => {
            if (errObj) {
                next(errObj);
                return;
            }

            if (useV1Users) {
                userStore
                    .createApiTokenHash(user)
                    .then(hashedUser => userStore.updateToken(hashedUser))
                    .then((hashedUser) => {
                        res.json({
                            token: hashedUser.api_token,
                            date: hashedUser.updated,
                            id: hashedUser.id
                        });
                    })
                    .catch((lastErr) => {
                        logger.error(lastErr, 'error while creating new token and updating user');
                        return res
                            .status(401)
                            .json({ error: 'error while creating new token and updating user' });
                    });
            } else {
                aclManager
                    .updateToken({ id: user.id }, false)
                    .then((token) => {
                        res.json({
                            token,
                            date: user.updated,
                            id: user.id
                        });
                    })
                    .catch((lastErr) => {
                        logger.error(lastErr, 'error while creating new token and updating user');
                        return res
                            .status(401)
                            .json({ error: 'error while creating new token and updating user' });
                    });
            }
        });
    })(req, res, next);
}

module.exports = api;
