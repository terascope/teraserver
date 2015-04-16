var worker = require('./lib/worker');

var foundation = require('agrifoundation')({
    name: 'AgriServer',
    elasticsearch: ['default'],
    mongodb: ['default'],
    statsd: ['default'],
    baucis: true,
    worker: worker
});
