var worker = require('./lib/worker');

var foundation = require('terafoundation')({
    name: 'TeraServer',
    elasticsearch: ['default'],
    mongodb: ['default'],
    statsd: ['default'],
    baucis: true,
    worker: worker
});
