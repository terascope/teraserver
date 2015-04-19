var fs = require('fs');

module.exports = function(context, app, express) {
    var config = context.sysconfig;
    var logger = context.logger;

    /// TODO: This doesn't seem like this belongs here.
    var passport = require('passport');

    // Services provided by TeraFoundation
    // TODO: this is assuming these are used all the time.
    // This should be more dynamic in respext to services defined by TeraFoundation
    var mongoose, elasticsearch, baucis;
    if (context.mongodb) mongoose = context.mongodb.default;
    if (context.elasticsearch) elasticsearch = context.elasticsearch.default;
    if (context.baucis) baucis = context.baucis;
    
    var api = {
        _plugins: [],

        notify: function(phase) {
            var deferred = [];
            for (var i = 0; i < this._plugins.length; i++) {
                var plugin = this._plugins[i];

                _call(plugin, phase, deferred);
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
        var base = '/pl/' + name;

        var plugin = require(name);
        if (plugin) {
            logger.info('Plugin ' + name + ': enabling.')

            // TODO: should we just be passing through the foundation context?
            plugin.config({
                app: app,
                url_base: base,
                server_config: config,
                mongodb: mongoose,
                elasticsearch: elasticsearch,
                baucis: baucis,
                passport: passport,
                logger: logger
            });

            if (_call(plugin, 'static')) {
                logger.info('Plugin ' + name + ': adding static assets');
                app.use(base + '/static', express.static(plugin.static()));

                // TODO: this should probably be deferred and check to make sure there
                // aren't conflicting aliases defined by plugins
                var aliases;
                if (aliases = _call(plugin, 'aliases')) {
                    aliases.forEach(function(alias) {
                        logger.info('Plugin ' + name + ': adding static content alias as  /pl/' + alias);
                        app.use('/pl/' + alias + '/static', express.static(plugin.static()));
                    })
                }
            }

            return plugin;
        }
        else {
            logger.error('Plugin ' + name + ' not found');
        }
    }

    api.load();
    api.notify('init');

    return api;

    function _call(object, func, deferred) {
        if (object.hasOwnProperty(func) && typeof object[func] === 'function') {
            return object[func](deferred);
        }
    }
}
