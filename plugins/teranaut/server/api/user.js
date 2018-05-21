'use strict';

module.exports = function(router) {

    router.use(requireUser);
//TODO dont know full path
    router.get('/users', function(req, res){
        console.log('getting users get');
    });

    router.head('/users', function(req, res){
        console.log('getting users head');

    });

    router.post('/users', function(req, res){
        console.log('getting users post');

    });

    router.put('/users', function(req, res){
        console.log('getting users put');

    });

    router.delete('/users', function(req, res){
        console.log('getting users delete');

    });


    function validateUser(){

    }


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