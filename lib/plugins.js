'use strict';

const _ = require('lodash');
const { getPlugin } = require('./utils');
const search = require('./search');
const passport = require('passport');

module.exports = function module(context, app, express) {
    const config = context.sysconfig;
    const { logger } = context;

    const { connection } = context.sysconfig.teraserver;
    const elasticsearch = context.foundation.getConnection({
        type: 'elasticsearch',
        endpoint: connection,
        cached: true }).client;

    const api = {
        _plugins: [],

        notify(phase) {
            const deferred = [];
            const actions = [];
            for (let i = 0; i < this._plugins.length; i += 1) {
                const plugin = this._plugins[i];
                actions.push(_call(plugin, phase, deferred));
            }
            // could return a promise already running or a fn yet to be called
            deferred.map((fn) => {
                if (typeof fn === 'function') return fn();
                return fn;
            });
            actions.concat(deferred);
            return Promise.all(actions);
        },

        load() {
            // We load Teranaut first.
            const plugins = this._plugins;
            plugins.push(loadPlugin('teranaut'));

            _.each(config.teraserver.plugins.names, (name) => {
                if (name !== 'teranaut') {
                    plugins.push(loadPlugin(name, config));
                }
            });
        }
    };

    // this is meant to be used in a post_process config setting
    function addDataType(map) {
        return results => results.map((doc) => {
            // addDataType only works if _index was set using  preserve_index_name
            if (doc._index) {
                // ie logstash-2018.7
                const firstKey = doc._index.split('-')[0];
                let type = map[firstKey];
                if (!type) {
                    // continue searching ie cluster:logstash-2018.7
                    const secondKey = firstKey.split(':')[1];
                    type = map[secondKey];
                }
                if (type) doc._type = type;
            }
            return doc;
        });
    }

    function loadPlugin(name) {
        const base = `/pl/${name}`;
        const plugin = getPlugin(name, config);

        if (plugin) {
            logger.info(`Plugin ${name}: enabling.`);

            // TODO: should we just be passing through the foundation context?
            plugin.config({
                context,
                app,
                express,
                url_base: base,
                server_config: config,
                elasticsearch,
                passport,
                logger,
                search,
                addDataType
            });

            if (_call(plugin, 'static')) {
                logger.info(`Plugin ${name}: adding static assets`);
                app.use(`${base}/static`, express.static(plugin.static()));

                // TODO: this should probably be deferred and check to make sure there
                // aren't conflicting aliases defined by plugins
                const aliases = _call(plugin, 'aliases');
                if (aliases) {
                    aliases.forEach((alias) => {
                        logger.info(`Plugin ${name}: adding static content alias as  /pl/${alias}`);
                        app.use(`/pl/${alias}/`, express.static(plugin.static()));
                    });
                }
            }

            return plugin;
        }

        logger.error(`Plugin ${name} not found`);
        return false;
    }

    api.load();

    return api;

    function _call(object, key, deferred) {
        if (Object.prototype.hasOwnProperty.call(object, key) && typeof object[key] === 'function') {
            return object[key](deferred);
        }
        return false;
    }
};
