'use strict'


const _ = require('lodash');

/*


function _flush() {
    // resets the tally
    console.log(tally);

    _.forIn(tally, (i) => {
            const avgSearchTime = _avgTime(i.searchTimes);
            delete i.searchTimes;
            i.avgSearchTime = avgSearchTime;
    });
    console.log('adding to es');
    console.log('resetting tally');

    console.log(tally);
    tally = {};
}
*/
let tally = {}

// setInterval(flush, 10000);
module.exports = function (){
    function _avgTime (timeArray) {
        const total = timeArray.reduce((total, time) => {
            return total + time;
        });
        return total/timeArray.length;
    }

    function tokenAndStatusCodeCount(req, res, searchTime) {
        const apiToken = req.user.api_token.slice(0,5);
        const statusCode = res.statusCode;
        const apiEndpoint = req._parsedOriginalUrl.pathname;

        if (_.has(tally, [apiToken, apiEndpoint, statusCode])) {
            tally[apiToken][apiEndpoint][statusCode] += 1;
        } else {
            _.setWith(tally, [apiToken, apiEndpoint, statusCode], 1, Object);
        }

        if(_.has(tally, [apiToken, apiEndpoint, 'searchTimes'])) {
            tally[apiToken][apiEndpoint].searchTimes.push(searchTime);
        } else {
            tally[apiToken][apiEndpoint].searchTimes = [searchTime];
        }
        return tally;
    }

    return {
        tokenAndStatusCodeCount
    }
}
