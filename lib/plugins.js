var fs = require('fs');

module.exports = function(app, express, config, logger) {
    // Initialize the service connections. These will be used by modules as they load.
    var mongoose = require('./mongo_connect');
    var elasticsearch = require('./es_connect');
    var baucis = require('baucis');

    var api = {
        _plugins: [],

        notify: function(phase) {
            for (var i = 0; i < this._plugins.length; i++) {
                var plugin = this._plugins[i];
             
                if (plugin.hasOwnProperty(phase)) {
                    plugin[phase]();
                }        
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
