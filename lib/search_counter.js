'use strict'


const _ = require('lodash');


let counter = {};
let timer = {};

// setInterval(flush, 10000);
module.exports = function (context){

    function _avgTime (timeArray) {
        const total = timeArray.reduce((total, time) => {
            return total + time;
        });
        return Math.ceil(total/timeArray.length);
    }

    function _formattedDate(date) {
       return date.slice(0, 7).replace(/-/gi, '.');
   }

    function _flush(){
        let nodename = context.sysconfig._nodeName.split('.');
        const workerId = nodename.pop();
        nodename = nodename.join('.');

        const esStats = context.foundation.getConnection({
           endpoint: context.sysconfig.searchCounter.esConnection,
           type: 'elasticsearch',
           cached: true
       }).client;

       if (!esStats) {
           throw new Error(`Unknown elasticsearch connection for stats ${context.foundation.connection}`);
       }

       const bulkRequest = [];

       const timestamp = new Date();
       const syncDate = _formattedDate(timestamp.toISOString(), true);

       _.forOwn(counter, (count, apiData) => {
           bulkRequest.push({
               index: {
                   _index: `counters-${syncDate}`,
                   _type: 'counter'
               }
           });

           let dataArray = apiData.split("-");

           const record = {
               date: timestamp,
               node: nodename,
               service: context.sysconfig.searchCounter.service,
               worker: workerId,
               apiToken: dataArray[0],
               apiEndpoint: dataArray[1],
               statusCode: dataArray[2],
               count: count
           };

           bulkRequest.push(record);

       });

       console.log(bulkRequest);
       esStats.bulk({
           body: bulkRequest
       })
       .then((resp) => {
       resp.items.forEach((item) => {
           if (item.create && item.create.status !== 201) {
               logger.error(`Stats sync error from bulk insert: ${item.create.status} ${item.create.error}`);
           }
       });
       })
       .catch((err) => {
           logger.error(`Error syncing stats data to ES: ${err}`);
       });
    }

    function tokenAndStatusCodeCount(req, res, searchTime) {
        const apiToken = req.user.api_token.slice(0,5);
        const statusCode = res.statusCode;
        const apiEndpoint = req._parsedOriginalUrl.pathname;

        if (_.has(counter, `${apiToken}-${apiEndpoint}-${statusCode}`)) {
            counter[`${apiToken}-${apiEndpoint}-${statusCode}`] += 1;
        } else {
            counter[`${apiToken}-${apiEndpoint}-${statusCode}`] = 1
        }

        if(_.has(timer, `${apiToken}-${apiEndpoint}`)) {
            timer[`${apiToken}-${apiEndpoint}`].push(searchTime);
        } else {
            timer[`${apiToken}-${apiEndpoint}`] = [searchTime];
        }

        _flush();
        return [counter, timer];
    }

    function __test_context() {
        return {
            _avgTime,
            _formattedDate
        }
    }

    return {
        tokenAndStatusCodeCount,
        __test_context
    }
};
