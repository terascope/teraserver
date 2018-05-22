'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const esApi = require('elasticsearch_api');
const parseError = require('error_parser');
const crypto = Promise.promisifyAll(require('crypto'));
const version = require('../../../../package.json').version;

module.exports = (context) => {
    const logger = context.apis.foundation.makeLogger({ module: 'user_store' });
    const esClient = context.foundation.getConnection({type: 'elasticsearch', cached: true}).client;
    const client = esApi(esClient, logger);
    const clusterName = 'teraserver';
    const index = `${context.name}__users`;
    const migrantIndexName = `${index}-v${version}`;
    const mapping = require('./mappings/user.json');
    const type = 'user';
    //TODO allow this to be configurable?
    const clientName = 'default';
    let saltLength = 32;
    let iterations = 25000;
    let keyLength = 512;
    let encoding = 'hex';
    let digest = 'sha1';

    function create(user) {
        return validate(user)
            .then(validUser => Promise.all([hashPassword(validUser), _isUnique(validUser)])
                .spread((hashedUser) => {
                    const query = { index: index, type: type, body: hashedUser };
                    return client.index(query)
                }))
            .catch(err => {
                const errMsg = parseError(err);
                logger.error(`could not save user error: ${errMsg}`);
                return Promise.reject(errMsg)
            })
    }

    function hashPassword(user){
        return Promise.resolve()
            .then(() => {
                return crypto.randomBytesAsync(saltLength)
                    .then((buf) => {
                        const salt = buf.toString(encoding);
                        return crypto.pbkdf2Async(user.hash, salt, iterations, keyLength, digest)
                            .then((rawHash) => {
                                user.hash = new Buffer(rawHash, 'binary').toString(encoding);
                                user.salt = salt;
                                return user;
                            })
                    })
            })
    }

    function _isUnique(user) {
        const query = { q: `username:${user.username}` };
        return client.count(query)
            .then((count) => {
                if (count !== 0) return Promise.reject('username is not unique');
                return true;
            })
    }

    function validate(user) {
        const rolesAvailable = {'admin': true, 'analyst': true, 'user': true, 'domains-user': true, 'class-b-user': true};
        return new Promise(function(resolve, reject){
            if (user.client_id === undefined || typeof user.client_id !== 'number') {
                reject('client_id must exists and be of type Number')
            }
            if (user.firstname && typeof user.firstname !== 'string') {
                reject('firstname must be of type String')
            }
            if (user.lastname && typeof user.lastname !== 'string') {
                reject('lastname must be of type String')
            }
            if (user.email) {
                if (typeof user.client_id !== 'string') {
                    reject('email must be of type String')
                }
                user.email = user.email.trim().toLowerCase();
            }
            if (user.api_token && typeof user.api_token !== 'string') {
                reject('api_token must be of type String')
            }
            if (!user.role) user.role = 'user';
            if (!user.created) user.created = Date.now();
            if (!user.updated) user.updated = Date.now();
            if (!_isDate(user.created)) reject('created must be of type Date');
            if (!_isDate(user.updated)) reject('updated must be of type Date');

            if (!rolesAvailable[user.role]) {
                reject(`unsupported role assignment, was given role: ${user.role}`)
            }
            if (user.username === undefined || typeof user.username !== 'string') {
                reject('username must exists and be of type String')
            }
            user.username = user.username.trim();
            resolve(user);
        })
    }

    function _isDate(_date){
        const date = typeof _date === 'number' ? _date : Number(_date);
        return moment(Number(date)).isValid();
    }

    const api = {
        create: create
    };

    return client.indexSetup(clusterName, index, migrantIndexName, mapping, type, clientName)
        .then(() => api)
};
