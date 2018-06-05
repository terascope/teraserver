'use strict';

const { configSchema } = require('../system_schema');
const Promise = require('bluebird');
const parseError = require('error_parser');
const esApiModule = require('elasticsearch_api');

const { argv } = require('yargs')
    .alias('m', 'mongodb')
    .alias('e', 'elasticsearch')
    .alias('i', 'index')
    .default('m', 'default')
    .default('s', 'default')
    .default('i', 'teraserver__users');


require('terafoundation')({
    name: 'teraserver',
    script,
    config_schema: configSchema
});

function formatRequest(users) {
    const formatted = [];
    const { index } = argv;

    users.forEach((user) => {
        user.id = user._id;
        delete user._id;
        formatted.push({ create: { _index: index, _type: 'user', _id: user.id } });
        formatted.push(user);
    });

    return formatted;
}

function script(context) {
    const { logger } = context;
    const mongo = { type: 'mongodb', connection: argv.mongodb, cached: true };
    const elasticsearch = { type: 'elasticsearch', connection: argv.elasticsearch, cached: true };

    const { client: mongoClient } = context.apis.foundation.getConnection(mongo);
    const { client: elasticClient } = context.apis.foundation.getConnection(elasticsearch);
    const esApi = esApiModule(elasticClient, logger);
    const users = mongoClient.model('Users', {});

    Promise.resolve()
        .then(() => users.find().lean())
        .then(formatRequest)
        .then(esApi.bulkSend)
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
