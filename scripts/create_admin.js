
var foundation = require('terafoundation')({
    name: 'CreateAdmin',
    mongodb: ['default'],
    script: script
});

function script(context) {
    var mongoose = context.mongodb.default;

    var models = require("../plugins/teranaut/server/models")({
        mongoose: mongoose,
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

    user.save(function(err, account) {
        if (err) {
            console.log('Failure creating account ' + err);
        }
        
        console.log('Account "admin" created');
        mongoose.connection.close(); 
    });
}