var foundation = require('terafoundation')({
    name: 'CreateAdmin',
    mongodb: ['default'],
    script: script
});

function script(context) {
    var mongoose = context.foundation.getConnection({type: 'mongodb', cached: true}).client;

    var logger = context.logger;

    var models = require("../plugins/teranaut/server/models")({
        mongoose: mongoose
    });

    var password = 'admin';

    user = new models.User({
        client_id: 0,
        role: 'admin',
        firstname: 'System',
        lastname: 'Admin',
        username: 'admin',
        hash: password
    });

    user.save(function (err, account) {
        if (err) {
            logger.error('Failure creating account ' + err);
        }

        logger.info('Account "admin" created');
        mongoose.connection.close();
    });
}