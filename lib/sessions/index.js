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
        }

        get(sid, _cb) {
            const cb = typeof _cb === 'function' ? _cb : () => {
            };
            this.client.get({
                index,
                type,
                id: sid
            }, (e, r) => {
                if (e || typeof r === 'undefined' || new Date().getTime() -  new Date(r._source.cookie.expires).getTime() > ttl) {
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
            }, (e, r) => {
                if (typeof cb === 'function') {
                    cb(e, r);
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

        touch(sid, sess, cb) {
            this.client.get({
                index,
                type,
                id: sid
            })
                .then((results) => {
                    const doc = _.get(results, '_source', {});
                    doc.cookie = sess.cookie;
                    return this.client.update({
                        index,
                        type,
                        id: sid,
                        body: {
                            doc
                        }
                    }, (e, r) => {
                        if (typeof cb === 'function') {
                            cb(e, doc);
                        }
                    });
                })
                .catch(err => cb(err));
        }
    }

    return {
        initialize: () => Promise.resolve()
            .then(() => indexSetup(clusterName, index, migrantIndexName, mapping, type, connection))
            .then(() => ESStore)
    };
};
