module.exports = function(config) {
    var baucis = config.baucis;
    var models = require("../models")(config);

    //var node = baucis.rest({ singular: "Node", findBy: "node_id" });
    //var user = baucis.rest({ singular: "User", findBy: "username" });
    
    var node = baucis.rest("Node" ).findBy("node_id");
    var user = baucis.rest("User" ).findBy("username");
    
    /**
     * Run custom handlers on the  collection.
     *
     * additional URL parameter distinct determines the field that should be unique.
     *
     * We also override the count parameter so that the count is performed server side.
     *
     * distinct and count can not be combined at this time.
     */
    var extensions = function(request, response, next) {
        var conditions = null;
        if (request.query.conditions) {
             conditions = JSON.parse(request.query.conditions)
        }

        if (request.query.distinct) {       
            request.baucis.query = request.baucis.query.model.distinct(request.query.distinct, conditions)
        }    
        else if (request.query.count) {
            request.baucis.query = request.baucis.query.model.count(conditions)
        }

        next();
    };

    node.query('collection', 'get', extensions);
    
    var requireAdmin = function(req, res, next) {
        console.log("Authorizing for role: " + req.user.role);

        if (req.user.role === 'admin') {
            next();
        }
        else {
            return res.json(403, { error: 'Access Denied - You don\'t have permission to this data' });
        }
    };

    // Only admin is allowed to update these data types
    node.request('post put delete', requireAdmin);
    
    var requireUser = function(req, res, next) {
        
        if (req.user.role === 'admin') {
            next();
        }
        else if (req.user.username === req.params.id) {
            // We're authorizing a user to update their own record. but they're not allowed to change their role.        
            delete req.body.role;

            next();
        }
        else {
            return res.json(403, { error: 'Access Denied - You don\'t have permission to this data' });
        }

    };

    // Admin can update and a user can update their own record, but not change their role
    user.request('get head post put delete', requireUser);

    var restrictQuery = function(req, res, next) {
        // All queries coming from a client should be restricted to the logged in user.
        if (req.user.role !== 'admin') {   
            req.baucis.query.where('user_id').equals(req.user._id);
        }

        next();
    }
};
