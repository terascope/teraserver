'use strict';

const express = require('express');

const router = express.Router();

router.get('/', (req, res, next) => {
    res.status(500).send('Invalid request');
    next();
});

module.exports = router;
