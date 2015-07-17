'use strict';

var argv = require('yargs')
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
    .default('s', 'http://localhost:8000')
    .argv;

var request = require('request');

var api = argv.server + "/api/v1";

var record = {
    client_id: 0,
    role: argv.role,
    firstname: argv.firstname,
    lastname: argv.lastname,
    username: argv.username,
    hash: argv.password
};

var options = {
    url: api + '/users?token=' + argv.token,
    headers: {
        'content-type': 'application/json'
    },
    body: JSON.stringify(record)
};

request.post(options, function (error, response, body) {

    if (error) {
        console.log(error);
    }

    if (response.statusCode != 201) {
        console.log(response.body);
    }

    if (!error && response.statusCode == 201) {
        //console.log('Account created');    

        var account = JSON.parse(response.body);

        var options = {
            url: api + '/token?username=' + argv.username + '&password=' + argv.password
        };

        request.post(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var record = JSON.parse(response.body);

                console.log(argv.username + " | " + argv.password + " | " + account._id + " | " + record.token);
                process.exit();
            }
        });
    }
});
