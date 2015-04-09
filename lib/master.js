module.exports = function(cluster, logger) {
    var workerCount = require('os').cpus().length;
    //var workerCount = 1;
    //var workerCount = 5;
    logger.info("Server starting up. Waiting for " + workerCount + " workers");
    
    // Create a worker for each CPU
    for (var i = 0; i < workerCount; i += 1) {
        cluster.fork();
    }

    // Listen for dying workers
    cluster.on('exit', function (worker) {
        // Replace the dead worker.
        logger.error('Worker ' + worker.id + ' died. Starting a new one.');
        cluster.fork();
    });
}
    