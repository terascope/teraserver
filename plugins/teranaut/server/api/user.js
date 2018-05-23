'use strict';

const parseError = require('error_parser');


module.exports = function(router, store, logger) {

    router.use(requireUser);

    router.get('/users', function(req, res){
        store.findAllUsers()
            .then(results => {
                const users = results.map(store.sanitizeUser);
                res.json(users)
            })
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: `could not get user` });
            })
    });

    router.get('/users/:username', function(req, res){
       const username = req.params.username;
        console.log('what is the username query here', username);
        store.findByUsername(username, true)
           .then(user => res.json(store.sanitizeUser(user)))
           .catch((err) => {
               const errMsg = parseError(err);
               logger.error(errMsg);
               res.status(500).json({ error: `could not find user with username ${username}` });
           })
    });

    router.head('/users', function(req, res){
        console.log('getting users head', req.body);
        res.send('got it')
    });

    router.post('/users', function(req, res){
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

    router.put('/users', function(req, res){
        const user = req.body;
        console.log('putting is being called');

        store.updateUser(user)
            .then(results => res.json(results))
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(errMsg);
                res.status(500).json({ error: 'error while creating user' });
            })
    });

    router.delete('/users', function(req, res){
        console.log('getting users delete', req.body);
        res.send('got it')
    });


    function requireUser(req, res, next) {
        if (req.user.role === 'admin') {
            next();
        }
        else if (req.user.username === req.params.id) {
            // We're authorizing a user to update their own record. but they're not allowed to change their role.
            delete req.body.role;

            next();
        }
        else {
            return res.status(403).json({error: 'Access Denied - You don\'t have permission to this data'});
        }
    }
};