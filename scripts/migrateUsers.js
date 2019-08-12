'use strict';

const Promise = require('bluebird');
const parseError = require('@terascope/error-parser');
const esApiModule = require('@terascope/elasticsearch-api');

const { argv } = require('yargs')
    .alias('m', 'mongodb')
    .default('m', 'default');
const { configSchema } = require('../system_schema');


require('terafoundation')({
    name: 'teraserver',
    script,
    config_schema: configSchema
});


function script(context) {
    const { logger } = context;
    const mongo = { type: 'mongodb', connection: argv.mongodb, cached: true };

    const { client: mongoClient } = context.apis.foundation.getConnection(mongo);
    const users = mongoClient.model('Users', {});
    // need to setup proper index w/ mapping
    let index;
    let client;
    let esApi;

    function formatRequest(userArray) {
        const formatted = [];

        userArray.forEach((user) => {
            user.id = user._id;
            delete user._id;
            delete user.__v;
            formatted.push({ create: { _index: index, _type: 'user', _id: user.id } });
            formatted.push(user);
        });

        return formatted;
    }

    Promise.resolve()
        .then(() => require('../plugins/teranaut/server/store/users')(context))
        .then((userStore) => userStore.searchSettings())
        .then((settings) => {
            ({ index, client } = settings);
            esApi = esApiModule(client, logger);
            return true;
        })
        .then(() => users.find().lean())
        .then(formatRequest)
        .then((data) => esApi.bulkSend(data))
        .then(() => {
            logger.info('migration complete');
            return logger.flush();
        })
        .then(() => process.exit(0))
        .catch((err) => {
            const errMsg = parseError(err);
            logger.error(errMsg);
            logger.flush()
                .then(() => process.exit(1));
        });
}
