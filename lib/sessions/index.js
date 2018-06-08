'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const elasticApi = require('elasticsearch_api');
const { version } = require('../../package.json');

module.exports = function (context, session) {
    const config = context.sysconfig.teraserver;
    const { connection, ttl } = config;
    const { client } = context.foundation.getConnection({
        type: 'elasticsearch',
        endpoint: connection,
        cached: true
    });
    const clusterName = context.sysconfig.teraserver.name;
    const index = `${clusterName}__sessions`;
    const migrantIndexName = `${index}-v${version}`;
    const mapping = require('./mapping.json');
    const type = 'session';
    const logger = context.apis.foundation.makeLogger({ module: 'teraserver_sessions' });
    const { indexSetup } = elasticApi(client, logger);

    class ESStore extends session.Store {
        constructor() {
            super();
            this.client = client;
            this.initialSessionTimeout();
        }

        get(sid, _cb) {
            const cb = typeof _cb === 'function' ? _cb : () => {
            };
            this.client.get({
                index,
                type,
                id: sid
            }, (e, r) => {
                if (e) {
                    if (e.message !== 'Not Found') logger.error(e);
                    return cb();
                }
                if (new Date().getTime() - new Date(r._source.cookie.expires).getTime() > ttl) {
                    this.destroy(sid);
                    return cb();
                }
                return cb(null, r._source);
            });
        }

        set(sid, sess, cb) {
            this.client.index({
                index,
                type,
                id: sid,
                body: sess
            }, (e) => {
                if (typeof cb === 'function') {
                    cb(e, sess);
                }
            });
        }

        destroy(sid, cb) {
            this.client.delete({
                index,
                type,
                id: sid
            }, (e, r) => {
                if (typeof cb === 'function') {
                    cb(e, r);
                }
            });
        }

        initialSessionTimeout() {
            const self = this;
            this.timeouts = {};
            this.client.search({
                index,
                type,
                body: {
                    query: {
                        match_all: {}
                    }
                },
                _source: false
            }, (e, r) => {
                if (e) {
                    if (e.statusCode !== 404) logger.error(e.response);
                }

                const hits = _.get(r, 'hits.hits');
                if (hits) {
                    hits.forEach((hit) => {
                        self.sessionTimeout(hit._id);
                    });
                }
            });
        }

        sessionTimeout(sid) {
            const self = this;
            if (this.timeouts[sid]) {
                clearTimeout(this.timeouts[sid]);
            }
            this.timeouts[sid] = setTimeout(() => {
                self.destroy(sid);
            }, ttl);
        }

        touch(sid, sess, cb) {
            this.sessionTimeout(sid);
            return this.client.update({
                index,
                type,
                id: sid,
                body: {
                    doc: sess
                }
            }, (e) => {
                if (typeof cb === 'function') {
                    cb(e, sess);
                }
            });
        }
    }

    return {
        initialize: () => Promise.resolve()
            .then(() => indexSetup(clusterName, index, migrantIndexName, mapping, type, connection))
            .then(() => ESStore)
    };
};
