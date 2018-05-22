"use strict";

const foundation = require('terafoundation')({
    name: 'teraserver',
    script: script
});

function script(context) {
    const logger = context.logger;
    const password = 'admin';
    const time = Date.now();
    const userStore = require('../plugins/teranaut/server/store/users')(context);

    const user = {
        client_id: 0,
        role: 'admin',
        firstname: 'System',
        lastname: 'Admin',
        username: 'admin',
        hash: password,
        created: time,
        updated: time
    };

    userStore
        .then((api) => api.create(user))
        .then(() => logger.info('succesfully created admin'))
        .catch(err => logger.error('error creating admin', err))
}