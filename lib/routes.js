'use strict';
var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    res.status(500).send('Invalid request');
    next();
});

module.exports = router;
