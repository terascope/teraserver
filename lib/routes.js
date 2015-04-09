'use strict';

var app = module.parent.exports;

app.get('/', function(req, res) {
    res.send(500, 'Invalid request');
});
