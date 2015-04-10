var fs = require('fs');

module.exports = function(app, express, config, logger) {
    // Initialize the service connections. These will be used by modules as they load.
    var mongoose = require('./connectors/mongodb')(config, logger);
    var elasticsearch = require('./connectors/elasticsearch')(config, logger);
    var baucis = require('baucis');

    var api = {
        _plugins: [],

        notify: function(phase) {
            var deferred = [];
            for (var i = 0; i < this._plugins.length; i++) {
                var plugin = this._plugins[i];
             
                if (plugin.hasOwnProperty(phase)) {
                    plugin[phase](deferred);
                }        
            }

            // call any functions added to the deferred list.
            // This will move those actions to run after all other plugins
            // have completed.
            for (var i = 0; i < deferred.length; i++) {
                deferred[i]();
            }
        },

        load: function() {            
            if (config.api.plugins && config.api.plugins.length > 0) {
                for (var i = 0; i < config.api.plugins.length; i++) {
                    var plugin = loadPlugin(config.api.plugins[i]);
                    if (plugin) this._plugins.push(plugin);
                }
            }
        }
    }

    function loadPlugin(name) {
        var path = config.api.plugins_path + '/' + name;
        var base = '/pl/' + name;
        if (fs.existsSync(path)) {
            logger.info('Plugin ' + name + ': enabling.')
            if (fs.existsSync(path + '/static')) {
                logger.info('Plugin ' + name + ': adding static assets');
                app.use(base + '/static', express.static(path + '/static'));
            }

            if (fs.existsSync(path + '/server/plugin.js')) {
                logger.info('Plugin ' + name + ': configuring routing');
                
                var plugin = require(path + '/server/plugin');
                plugin.config({
                    app: app, 
                    url_base: base,
                    path: path, 
                    server_config: config,
                    mongoose: mongoose,
                    elasticsearch: elasticsearch,
                    baucis: baucis
                });
                return plugin;
            }
            else {
                logger.error('Plugin ' + name + ': can not be loaded. Missing plugin.js' )
            }
        }
        else {
            logger.error('Plugin ' + name + ' not found in path ' + path);
        }
    }    

    api.load();
    api.notify('init');

    return api;
}
