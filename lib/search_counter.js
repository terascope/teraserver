'use strict'


const _ = require('lodash');


let counter = {};

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

   // for testing if not a function, skip
   // create test that handles connection
   let esStats = {};
   if(typeof context.foundation.getConnection === 'function') {
       esStats = context.foundation.getConnection({
          endpoint: context.sysconfig.teraserver.stats.es_connection,
          type: 'elasticsearch',
          cached: true
       }).client;
   }

   function _bulkRequests(){
       let nodename = context.sysconfig._nodeName.split('.');
       const workerId = nodename.pop();
       nodename = nodename.join('.');

       const service = context.sysconfig.teraserver.stats.service;
       const timestamp = new Date();
       const syncDate = _formattedDate(timestamp.toISOString(), true);

       const bulkRequest = [];

       _.forOwn(counter, (count, countObject) => {
           let countData = countObject.split("-");
           let type = countData.length === 3 ? 'counter' : 'timer';

           bulkRequest.push({
               index: {
                   _index: `stats-${syncDate}`,
                   _type: type
               }
           });

           const record = {
               date: timestamp,
               node: nodename,
               service: service,
               worker: workerId,
               token: countData[0],
               endpoint: countData[1]
           };

           if (type === 'counter'){
               record.status = countData[2];
               record.count = count;
           } else {
               record.avg_time = _avgTime(count);
           }

           bulkRequest.push(record);
       });
       return bulkRequest;
   };

   function _sendBulkRequest(){
       const bulkRequest = _bulkRequests();

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
       counter = {};
   }

   function _resetCounter() {
       counter = {};
   }

   setInterval(() => {
       if(!(_.isEmpty(counter))) {
           _bulkRequests();
           _sendBulkRequest();
           _resetCounter();
       }
   }, context.sysconfig.teraserver.stats.interval);

   function tokenAndStatusCodeCount(req, res, searchTime) {
       const apiToken = req.user.api_token.slice(0,5);
       const statusCode = res.statusCode;
       const apiEndpoint = req._parsedOriginalUrl.pathname;

       if (_.has(counter, `${apiToken}-${apiEndpoint}-${statusCode}`)) {
           counter[`${apiToken}-${apiEndpoint}-${statusCode}`] += 1;
       } else {
           counter[`${apiToken}-${apiEndpoint}-${statusCode}`] = 1
       }

       if(_.has(counter, `${apiToken}-${apiEndpoint}`)) {
           counter[`${apiToken}-${apiEndpoint}`].push(searchTime);
       } else {
           counter[`${apiToken}-${apiEndpoint}`] = [searchTime];
       }
       return counter;
   }

   function __test_context() {
       return {
           _avgTime,
           _formattedDate,
           _bulkRequests,
           _resetCounter,
           _sendBulkRequest
       }
   }

    return {
        tokenAndStatusCodeCount,
        __test_context
    }
};
