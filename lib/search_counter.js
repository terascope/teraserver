'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

let counter = {};

module.exports = (context) => {
    // if the search counter is not configured - don't do anything
    if (!_.has(context, 'sysconfig.teraserver.stats')) {
        return { tokenAndStatusCodeCount: () => ({}) };
    }

    const logger = context.foundation.makeLogger({ module: 'teraserver_search_counter' });
    let interval = 10000;

    if (_.get(context, 'sysconfig.teraserver.stats.interval')) {
        ({ interval } = context.sysconfig.teraserver.stats);
    }

    function _avgTime(timeArray) {
        const timesOnly = timeArray.filter(t => !(isNaN(t)));
        if (timesOnly.length === 0) return 0;

        const total = timesOnly.reduce((sum, time) => sum + time, 0);
        return Math.ceil(total / timesOnly.length);
    }

    function _formattedDate(date) {
        return date.slice(0, 7).replace(/-/gi, '.');
    }

    function _bulkRequests() {
        let nodename = context.sysconfig._nodeName.split('.');
        const workerId = nodename.pop();
        nodename = nodename.join('.');

        const { service } = context.sysconfig.teraserver.stats;
        const timestamp = new Date();
        const syncDate = _formattedDate(timestamp.toISOString(), true);

        const bulkRequest = [];

        _.forOwn(counter, (count, countObject) => {
            const countData = countObject.split('-');

            bulkRequest.push({
                index: {
                    _index: `counters-${syncDate}`,
                    _type: 'counter'
                }
            });

            const type = countData.length === 3 ? 'counter' : 'timer';

            const record = {
                date: timestamp,
                node: nodename,
                service,
                worker: workerId,
                token: countData[0],
                url: countData[1],
                type
            };

            if (type === 'counter') {
                record.status = countData[2];
                record.count = count;
            } else {
                record.avg_time = _avgTime(count);
            }

            bulkRequest.push(record);
        });
        return bulkRequest;
    }

    function _resetCounter() {
        counter = {};
    }

    let endpoint = 'default';
    if (_.has(context, 'sysconfig.teraserver.stats.es_connection')) {
        endpoint = context.sysconfig.teraserver.stats.es_connection;
    }

    const esStats = context.foundation.getConnection({
        endpoint,
        type: 'elasticsearch',
        cached: true
    }).client;

    function _sendBulkRequestToEs() {
        const bulkRequest = _bulkRequests();

        return esStats.bulk({
            body: bulkRequest
        })
            .then((resp) => {
                resp.items.forEach((item) => {
                    if (_.get(item, 'index.status') !== 201) {
                        logger.error(`Stats sync error from bulk insert: ${item.index.status} ${item.index.error}`);
                    }
                });
            })
            .catch((err) => {
                logger.error(`Error syncing stats data to ES: ${err}`);
            });
    }

    let isProcessing = false;
    setInterval(() => {
        if (!isProcessing && !(_.isEmpty(counter))) {
            isProcessing = true;
            Promise.resolve(_sendBulkRequestToEs())
                .then(_resetCounter)
                .catch(error => logger.error(error))
                .finally(() => isProcessing = false);
        }
    }, interval);

    function tokenAndStatusCodeCount(req, res, searchTime) {
        const apiToken = _.get(req, 'user.api_token') ? req.user.api_token.slice(0, 5) : 'none';
        const statusCode = _.get(res, 'statusCode') ? res.statusCode : 'none';
        const apiEndpoint = _.get(req, '_parsedOriginalUrl.pathname') ? req._parsedOriginalUrl.pathname : 'none';

        if (_.has(counter, `${apiToken}-${apiEndpoint}-${statusCode}`)) {
            counter[`${apiToken}-${apiEndpoint}-${statusCode}`] += 1;
        } else {
            counter[`${apiToken}-${apiEndpoint}-${statusCode}`] = 1;
        }

        if (_.has(counter, `${apiToken}-${apiEndpoint}`)) {
            counter[`${apiToken}-${apiEndpoint}`].push(searchTime);
        } else {
            counter[`${apiToken}-${apiEndpoint}`] = [searchTime];
        }


        return counter;
    }

    function testContext() {
        return {
            _avgTime,
            _formattedDate,
            _bulkRequests,
            _resetCounter,
            _sendBulkRequestToEs
        };
    }


    return {
        tokenAndStatusCodeCount,
        __test_context: testContext
    };
};
