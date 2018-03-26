'use strict'


// const _ = require('lodash');

let tally = {}


/*
function _avgTime (avgArray) {
    const total = avgArray.reduce((total, time) => {
        return total + time;
    });
    return total/avgArray.length;
}


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

// setInterval(flush, 10000);

function tokenAndStatusCodeCount(req, res, searchTime) {
    console.log(req.user.api_token);
    const apiToken = req.user.api_token.slice(0,5);
    const statusCode = res.statusCode;
    const pathname = req._parsedOriginalUrl.pathname;

    const pathArray = pathname.split("/");
    const apiEndpoint = pathArray[pathArray.length - 1];

    if (tally[apiToken] && tally[apiToken][apiEndpoint] && tally[apiToken][apiEndpoint][statusCode]) {
        tally[apiToken][apiEndpoint][statusCode] += 1;
    } else if (tally[apiToken] && tally[apiToken][apiEndpoint]){
        tally[apiToken][apiEndpoint][statusCode] = 1;
    } else if (tally[apiToken]) {
        let temp = {};
        temp[statusCode] = 1;
        tally[apiToken][apiEndpoint] = temp;
    } else {
        tally[apiToken] = {};
        let tempEndpoint = {};
        let tempStatus = {};
        tempStatus[statusCode] = 1;
        tempEndpoint[apiEndpoint] = tempStatus;
        tally[apiToken] = tempEndpoint;
    }

    tally[apiToken][apiEndpoint].searchTimes ? tally[apiToken][apiEndpoint].searchTimes.push(searchTime):
                                  tally[apiToken][apiEndpoint].searchTimes = [searchTime];

    console.log(tally);
    console.log(tally[apiToken][apiEndpoint].searchTimes);
    return tally;

}

module.exports = { tokenAndStatusCodeCount };

// setInternval(flushTally, interval);
