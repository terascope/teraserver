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
    let tokenLength = 128;
    let encoding = 'hex';
    let digest = 'sha1';

    function findByToken(token) {
        const query = { index: index, type: type, q: `api_token:${token}` };
        return _search(query)
            .then(results => results[0])
            .catch((err) => {
                logger.error(`could not find user for token: ${token} , error: ${err}`);
                return Promise.reject(err)
            })
    }

    function createUser(user) {
        return _validate(user)
            .then(validUser => Promise.all([_hashCredentials(validUser), _isUnique(validUser)])
                .spread((hashedUser) => {
                    const query = { index: index, type: type, id: hashedUser.id, body: hashedUser };
                    return client.index(query)
                        .then(() => ( { id: hashedUser.id, token: hashedUser.api_token, date: hashedUser.created } ))
                }))
            .catch(err => {
                const errMsg = parseError(err);
                logger.error(`could not save user error: ${errMsg}`);
                return Promise.reject(errMsg)
            })
    }

    function updateUser(user) {
        user.updated = Date.now();
        const query = {
            index: index,
            type: type,
            id: user.id,
            body: {
                doc: {}
            },
            refresh: true,
            retryOnConflict: 3
        };

        return _validate(user)
            .then(validUser => {
                query.body.doc = validUser;
                return client.update(query)
                    .then(() => user)
            })
    }

    function updateToken(user){
        return createApiTokenHash(user)
            .then(tokenUser => updateUser(tokenUser))
    }

    function authenticateUser(username, password) {
        return findByUsername(username)
            .then(user =>  {
                if (!user) return false;
                return _createPasswordHash({ hash: password }, user.salt)
                    .then((hashObj) => {
                        if(hashObj.hash === user.hash) return user;
                        return null
                    })
            })
            .catch((err) => {
                const errMsg = parseError(err);
                logger.error(`could not findUser, error: ${errMsg}`);
                return Promise.reject(errMsg)
            })


    }

    function sanitizeUser(_user){
        const user = _.cloneDeep(_user);
        delete user.hash;
        delete user.salt;
        return user;
    }
    //TODO add fields to sanitized query

    function findByUsername(username, sanitize) {
        const query = { index: index, type: type, q: `username:${username.trim()}` };
        return _search(query)
            .then(results => results[0])
            .catch((err) => {
                logger.error(`could not find user for username: ${username} , error: ${err}`);
                return Promise.reject(err)
            })
    }

    function _search(query) {
        return client.search(query)
            .catch(err => {
                const errMsg = parseError(err);
                return Promise.reject(errMsg)
            })
    }

    function _getSalt(_salt){
        if(_salt) return Promise.resolve(_salt);
        return crypto.randomBytesAsync(saltLength)
            .then((buf) => buf.toString(encoding));
    }

    function _createId(user) {
        const shasum = crypto.createHash('sha1');
        shasum.update(Math.random() + Date.now() + user.username + user.hash );
        user.id = shasum.digest('hex').slice(0, 10);
        return user;
    }

    function _createPasswordHash(user, _salt) {
        return _getSalt(_salt)
            .then((salt) => {
                return crypto.pbkdf2Async(user.hash, salt, iterations, keyLength, digest)
                    .then((rawHash) => {
                        user.hash = new Buffer(rawHash, 'binary').toString(encoding);
                        user.salt = salt;
                        return user;
                    })
            });
    }

    // the user.hash is created from _createPasswordHash (the old code appears to
    // completely undergo hashing before this is made)
    function createApiTokenHash(user) {
        const shasum = crypto.createHash('sha1');
        return crypto.randomBytesAsync(tokenLength)
            .then((buffer) => {
                shasum.update(buffer + Date.now() + user.hash + user.username);
                user.api_token = shasum.digest('hex');
                return user;
            });
    }

    function _hashCredentials(user){
        return Promise.resolve()
            .then(() => _createPasswordHash(user))
            .then(() => createApiTokenHash(user))
            .then(() => _createId(user))
    }

    function _isUnique(user) {
        const query = { q: `username:${user.username}` };
        return client.count(query)
            .then((count) => {
                if (count !== 0) return Promise.reject('username is not unique');
                return true;
            })
    }

    function _validate(user) {
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
                if (typeof user.email !== 'string') {
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

    function serializeUser(user, next) {
        next(null, user.username)
    }

    function deserializeUser(username, next) {
        const query = { index: index, type: type, q: `username:${username}` };
        return _search(query)
            .then((results) => next(null, results[0]))
            .catch((err) => {
                logger.error(`could not find user, error: ${err}`);
                next(err)
            })
    }

    function findAllUsers(){
        const query = { index: index, type: type, q: `role:*`, size: 10000 };
        return _search(query)
            .catch((err) => {
                logger.error(`could not find user for token: ${token} , error: ${err}`);
                return Promise.reject(err)
            })
    }


    const api = {
        createUser: createUser,
        updateUser: updateUser,
        updateToken: updateToken,
        findByToken: findByToken,
        findAllUsers: findAllUsers,
        sanitizeUser: sanitizeUser,
        authenticateUser: authenticateUser,
        createApiTokenHash: createApiTokenHash,
        findByUsername: findByUsername,
        serializeUser: serializeUser,
        deserializeUser: deserializeUser
    };

    return client.indexSetup(clusterName, index, migrantIndexName, mapping, type, clientName)
        .then(() => api)
};


