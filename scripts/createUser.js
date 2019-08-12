/* eslint-disable no-console */

'use strict';

const request = require('request');

const { argv } = require('yargs')
    .usage('Usage: $0 -a API token -u username -p password -f firstname -l lastname -s [API server URL] -r [role] ')
    .demand(['u', 'p', 'f', 'l'])
    .alias('u', 'username')
    .alias('p', 'password')
    .alias('f', 'firstname')
    .alias('l', 'lastname')
    .alias('r', 'role')
    .alias('s', 'server')
    .alias('a', 'token')
    .default('r', 'user')
    .default('s', 'http://localhost:8000');

const api = `${argv.server}/api/v1`;

const record = {
    client_id: 0,
    role: argv.role,
    firstname: argv.firstname,
    lastname: argv.lastname,
    username: argv.username,
    hash: argv.password
};

const options = {
    url: `${api}/users?token=${argv.token}`,
    headers: {
        'content-type': 'application/json'
    },
    body: JSON.stringify(record)
};

request.post(options, (error, response) => {
    if (error) {
        console.log(error);
    }
    if (response.statusCode !== 201) {
        console.log(response.body);
    }
    if (!error && response.statusCode === 201) {
        const account = JSON.parse(response.body);
        console.log(`${argv.username} | ${argv.password} | ${account.id} | ${account.token}`);
    }
});
