'use strict';

const util = require("util");
const _ = require('lodash');
const Promise = require('bluebird');
const elasticApi = require('elasticsearch_api');
const version = require('../../package.json').version;

module.exports = function (context, session) {
    /**
     * Constructor
     * @param {String} options.host ElasticSearch host (default: "localhost:9200")
     * @param {String} options.index ElasticSearch's session index (default: "express")
     * @param {String} options.typeName ElasticSearch's session typename (default: "session")
     * @param {String} options.ttl (default: 1h)
     * @param {String} options.prefix (default: "")
     *
     *
     */
    const clusterName = 'teraserver';
    const index = `${context.name}__sessions`;
    const migrantIndexName = `${index}-v${version}`;
    const mapping = require('./mapping.json');
    const type = 'session';
    const clientName = 'default';
    const client = context.foundation.getConnection({type: 'elasticsearch', endpoint: clientName, cached: true}).client;
    const logger = context.apis.foundation.makeLogger({ module: 'teraserver_sessions' });
    const elasticsearch = elasticApi(client, logger);

    function ESStore(options) {
        const defaults = {
            host: "localhost:9200",
            index: index,
            typeName: type,
            ttl: context.sysconfig.teraserver.ttl
        };
        const connectionName = _.get(options, 'connection') || 'default';

        this.options = util._extend(defaults, options || {});
        this.client = client;

        this.initialSessionTimeout()
    }

    util.inherits(ESStore, session.Store);


    /**
     * Get session data
     */
    ESStore.prototype.get = function (sid, cb) {
        this.client.get({
            index: this.options.index,
            type: this.options.typeName,
            id: sid
        }, (e, r) => {
            if( typeof cb !== "function" ) {
                cb = () => {};
            }
            if ( e || typeof r === 'undefined' || new Date().getTime() - r._source.timestamp > this.options.ttl ) {
                return cb();
            }
            cb(null, r._source);
        })
    };


    /**
     * Set session data
     */
    ESStore.prototype.set = function (sid, sess, cb) {
        sess.timestamp = new Date().getTime();
        this.client.index({
            index: this.options.index,
            type: this.options.typeName,
            id: sid,
            body: sess
        }, function (e, r) {
            logger.error('what is the e', e);
            if( typeof cb === "function" ) {
                cb(e);
            }
        });
    };


    /**
     * Destroy a session's data
     */
    ESStore.prototype.destroy = function (sid, cb) {
        this.client.delete({
            index: this.options.index,
            type: this.options.typeName,
            id: sid
        }, function (e, r) {
            if( typeof cb === "function" ) {
                cb(e, r);
            }
        });
    };

    /**
     * Set up initial timeout after service restart
     */
    ESStore.prototype.initialSessionTimeout = function () {
        var self = this;
        this.timeouts = {};
        this.client.search({
            index: this.options.index,
            type: this.options.typeName,
            body: {
                query: {
                    match_all: {}
                }
            },
            _source: false
        }, function (e, r) {
            if (e) {
                if (e.statusCode  !== 404) logger.error(e.response)
            }

            var hits = _.get(r, 'hits.hits');
            if (hits) {
                hits.forEach(function (hit) {
                    self.sessionTimeout(hit._id)
                })
            }
        })
    };

    /**
     * Clear existing timeout for session deletion and refresh
     */
    ESStore.prototype.sessionTimeout = function (sid) {
        const self = this;
        if ( this.timeouts[sid] ) {
            clearTimeout(this.timeouts[sid]);
        }
        this.timeouts[sid] = setTimeout(function () {
            self.destroy(sid);
        }, this.options.ttl);
    };

    /**
     * Refresh a session's expiry
     */
    ESStore.prototype.touch = function (sid, sess, cb) {
        this.sessionTimeout(sid);
        this.client.get({
            index: this.options.index,
            type: this.options.typeName,
            id: sid
        })
            .then((results) => {
                var doc = _.get(results, '_source',  {});
                var time = _.get(doc, 'cookie.originalMaxAge', 0) + new Date().getTime();
                doc.cookie.expires = time;
                return this.client.update({
                    index: this.options.index,
                    type: this.options.typeName,
                    id: sid,
                    body: {
                        doc: doc
                    }
                }, function (e, r) {
                    if ( typeof cb === "function" ) {
                        cb(e, r);
                    }
                });
            })
            .catch(err => cb(err));

    };
    //clusterName, newIndex, migrantIndexName, mapping, recordType, clientName, _time
    return {
        initialize: () => {
            return Promise.resolve()
                .then(() => elasticsearch.indexSetup(clusterName, index, migrantIndexName, mapping, type, clientName))
                .then(() => ESStore)
        }
    }
};