'use strict';

var model;

module.exports = function (config) {
    var logger = config.logger;
    var mongoose = config.mongoose;

    if (!model) {
        var passportLocalMongoose = require('passport-local-mongoose');
        var crypto = require('crypto');

        var Schema = mongoose.Schema;

        var userSchema = new Schema({
            client_id: {type: Number, required: true},
            firstname: String,
            lastname: String,
            role: {
                type: String,
                required: true,
                enum: ['admin', 'analyst', 'user', 'domains-user', 'class-b-user'],
                default: 'user'
            },
            username: {type: String, trim: true, required: true, unique: true},
            /*password:       { type: String, trim: true, required: true },*/
            email: {type: String, trim: true, lowercase: true},
            api_token: String,

            created: {type: Date, default: Date.now}, // Date the network was added
            updated: {type: Date, default: Date.now}
        });

        userSchema.plugin(passportLocalMongoose);

        userSchema.pre('save', function (next) {
            this.updated = new Date();

            if (!this.isModified('hash')) return next();

            // Hash is passed in as clear text so we need to hash it again
            this.setPassword(this.hash, function (err, self) {
                if (err) {
                    // TODO: we need a proper logger instance here
                    logger.error("Error setting password.");
                    return next(err);
                }

                var shasum = crypto.createHash('sha1');
                crypto.randomBytes(128, function (err, buf) {
                    if (err) {
                        logger.error("Error generating randomBytes on User save.");
                        return next(err);
                    }

                    shasum.update(buf + Date.now() + self.hash + self.username);
                    var token = shasum.digest('hex');
                    self.api_token = token;

                    next()
                })
            })
        });

        userSchema.index({'client_id': 1, 'username': 1});

        model = mongoose.model('User', userSchema);
    }

    return model;
};
