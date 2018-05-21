'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const esApi = require('elasticsearch_api');
const parseError = require('error_parser');

module.exports = (context) => {
    const logger = context.apis.foundation.makeLogger({ module: 'user_store' });
    const esClient = context.foundation.getConnection({type: 'elasticsearch', cached: true}).client;
    const client = esApi(esClient, logger);
    const index = 'teraserver__users';
    const type = 'user';

    //TODO create index w/ mapping
    //TODO need hash crypto call
    function create(user) {
        return validate(user)
            .then(validUser =>
                _isUnique(validUser)
                    .then(() => {
                        const query = { index: index, type: type, body: validUser };
                        return client.index(query)
                    }))
            .catch(err => {
                const errMsg = parseError(err);
                logger.error(`could not save user error: ${errMsg}`);
                return Promise.reject(errMsg)
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
        var rolesAvailable = {'admin': true, 'analyst': true, 'user': true, 'domains-user': true, 'class-b-user': true};
        return new Promise(function(resolve, reject){
            if (!user.client_id || typeof user.client_id !== 'Number') {
                reject('client_id must exists and be of type Number')
            }
            if (user.firstname && typeof user.firstname !== 'String') {
                reject('firstname must be of type String')
            }
            if (user.lastname && typeof user.lastname !== 'String') {
                reject('lastname must be of type String')
            }
            if (!user.client_id || typeof user.client_id !== 'Number') {
                reject('client_id must exists and be of type Number')
            }
            if (user.email) {
                if (typeof user.client_id !== 'String') {
                    reject('email must be of type String')
                }
                user.email = user.email.trim().toLowerCase();
            }
            if (user.api_token && typeof user.api_token !== 'String') {
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
            if (!user.username || typeof user.username !== 'String') {
                reject('username must exists and be of type String')
            }
            user.username = user.username.trim();
            resolve(user);
        })
    }

    function _isDate(_date){
        var date = typeof _date === 'Number' ? _date : Number(_date);
        return moment(Number(date)).isValid();
    }

    return {
        create: create
    }
};
