"use strict";

const _ = require('lodash');
const getPlugin = require('./utils').getPlugin;
const search = require('./search');
const passport = require('passport');

module.exports = function(context, app, express) {
    const config = context.sysconfig;
    const logger = context.logger;

    // This should be more dynamic in respect to services defined by TeraFoundation
    const elasticsearch = context.foundation.getConnection({type: 'elasticsearch', cached: true}).client;

    const api = {
        _plugins: [],

        notify: function(phase) {
            const deferred = [];
            const actions = [];
            for (let i = 0; i < this._plugins.length; i++) {
                const plugin = this._plugins[i];
                actions.push(_call(plugin, phase, deferred));
            }
            actions.concat(deferred);
            return Promise.all(actions)
        },

        load: function() {
            // We load Teranaut first.
            const plugins = this._plugins;
            plugins.push(loadPlugin('teranaut'));

            _.each(config.teraserver.plugins.names, function(name) {
                if (name !== 'teranaut') {
                    plugins.push(loadPlugin(name, config))
                }
            });
        }
    };

    function loadPlugin(name) {
        const base = '/pl/' + name;
        const plugin = getPlugin(name, config);

        if (plugin) {
            logger.info('Plugin ' + name + ': enabling.');

            // TODO: should we just be passing through the foundation context?
            plugin.config({
                context: context,
                app: app,
                express: express,
                url_base: base,
                server_config: config,
                elasticsearch: elasticsearch,
                passport: passport,
                logger: logger,
                search: search
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
                        app.use('/pl/' + alias + '/', express.static(plugin.static()));
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

    return api;

    function _call(object, func, deferred) {
        if (object.hasOwnProperty(func) && typeof object[func] === 'function') {
            return object[func](deferred);
        }
    }
};
