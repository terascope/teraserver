module.exports = function(config) {
    var api = {
        Node: require('./Node.js')(config),
        User: require('./User.js')(config)
    };

    return api;
};