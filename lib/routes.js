'use strict';

var app = module.parent.exports;

app.get('/', function(req, res) {
    res.status(500).send('Invalid request');
});
