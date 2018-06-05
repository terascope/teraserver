'use strict';

const { configSchema } = require('../system_schema');

require('terafoundation')({
    name: 'teraserver',
    script,
    config_schema: configSchema
});

function script(context) {
    const { logger } = context;
    const password = 'admin';
    const time = new Date().toISOString();
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
        .then(api => api.createUser(user))
        .then(() => logger.info('succesfully created admin'))
        .catch(err => logger.error('error creating admin', err));
}
