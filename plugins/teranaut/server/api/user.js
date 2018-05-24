'use strict';

const parseError = require('error_parser');
const path = require('path');

module.exports = function(router, store, logger) {

    router.use(requireUser);

    router.get('/users', function(req, res) {
        console.log('the query', req.query)
        console.log('the params', req.params)
        console.log('the body', req.body)

        store.findAllUsers()
            .then(results => res.json(results))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: `could not get user` });
            })
    });

    router.get('/users/:username', function(req, res) {
       const username = req.params.username;
        store.findByUsername(username, true)
           .then(user => res.json(user))
           .catch((err) => {
               const errMsg = parseError(err);
               logger.error(errMsg);
               res.status(500).json({ error: `could not find user with username ${username}` });
           })
    });

    router.delete('/users/:username', function(req, res) {
        const username = req.params.username;
        store.findByUsername(username)
            .then(user => store.deleteUser(user))
            .then(() => res.status(204).send({}))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: `could not delete user with username ${username}` });
            })
    });

    router.post('/users', function(req, res) {
       const user = req.body;
        console.log('posting is being called');
        store.createUser(user)
           .then((results) => res.status(201).json(results))
           .catch((err) => {
               const errMsg = parseError(err);
               logger.error(errMsg);
               res.status(500).json({ error: 'error while creating user' });
           })
    });

    router.put('/users/:username', function(req, res) {
        const user = req.body;

        store.updateUser(user)
            .then(results => res.json(results))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: 'error while updating user' });
            })
    });

    function requireUser(req, res, next) {
        const username = path.parse(req.url).name;

        if (req.user.role === 'admin') {
            next();
        }
        else if (req.user.username === req.params.id || req.user.username === username) {
            // We're authorizing a user to update their own record. but they're not allowed to change their role.
            delete req.body.role;
            next();
        }
        else {
            return res.status(403).json({ error: 'Access Denied - You don\'t have permission to this data' });
        }
    }
};
