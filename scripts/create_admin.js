"use strict";

var foundation = require('terafoundation')({
    name: 'CreateAdmin',
    script: script
});

function script(context) {
    var client = context.foundation.getConnection({type: 'elasticsearch', cached: true}).client;
    var logger = context.logger;
    var password = 'admin';
    var time = Date.now();

    var user = {
        client_id: 0,
        role: 'admin',
        firstname: 'System',
        lastname: 'Admin',
        username: 'admin',
        hash: password,
        created: time,
        updated: time
    };

    client.index({ index: 'teraserver__users', type: 'user', body: user})
        .then(() => logger.info('successfully created admin'))
        .catch(err => logger.error('error creating adming', err))

}