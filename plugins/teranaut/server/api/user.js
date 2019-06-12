'use strict';

const parseError = require('@terascope/error-parser');
const path = require('path');

module.exports = (router, store, logger, teraSearchApi) => {
    const searchSettings = store.searchSettings();

    router.use(requireUser);

    router.get('/users', (req, res) => {
        const queryConfig = {
            es_client: searchSettings.client,
            sort_enabled: true,
            sort_default: false,
            sort_dates_only: false,
            date_range: 'created',
            require_query: false,
            allowed_fields: searchSettings.fields
        };

        teraSearchApi.luceneQuery(req, res, searchSettings.index, queryConfig);
    });

    router.get('/users/:username', (req, res) => {
        const { username } = req.params;
        store.findByUsername(username, true)
            .then(user => res.json(user))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: `could not find user with username ${username}` });
            });
    });

    router.delete('/users/:username', (req, res) => {
        const { username } = req.params;
        store.findByUsername(username)
            .then(user => store.deleteUser(user))
            .then(() => res.status(204).send({}))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: `could not delete user with username ${username}` });
            });
    });

    router.post('/users', (req, res) => {
        const user = req.body;
        store.createUser(user)
            .then(results => res.status(201).json(results))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: 'error while creating user' });
            });
    });

    router.put('/users/:username', (req, res) => {
        const user = req.body;

        store.updateUser(user)
            .then(results => res.json(results))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: 'error while updating user' });
            });
    });

    function requireUser(req, res, next) {
        const username = path.parse(req.url).name;

        if (req.user.role === 'admin') {
            next();
        } else if (req.user.username === req.params.id || req.user.username === username) {
            // A user can update their own record. but they're not allowed to change their role.
            delete req.body.role;
            next();
        } else {
            res.status(403).json({ error: 'Access Denied - You don\'t have permission to this data' });
        }
    }
};
