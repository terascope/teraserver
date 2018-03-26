'use strict';

var _ = require('lodash');
const http = require('http');


describe('teraserver search analytics module', function() {
    var search_module = require('../lib/api_analytics');

    it('query responses are aggregated', function() {
        let req = {user: { api_token: 'abc123dabdsioueadbs23423' },
                     _parsedOriginalUrl: { pathname: 'api/v1/logstash' }
                 };
        let res = { statusCode: 200};
        let count = search_module.tokenAndStatusCodeCount(req, res, 10);

        // api key is object property
        expect(count.abc12).toBeDefined();
        // endpoint is property of api key
        expect(count.abc12.logstash).toBeDefined();
        // status is property of endpoint
        expect(count.abc12.logstash['200']).toBeDefined();
        // status value is the count
        expect(count.abc12.logstash['200']).toBe(1);
        // searchTimes is property of endpoint
        expect(count.abc12.logstash.searchTimes).toBeDefined();
        // searchTime contains one item with a value of 10
        expect(count.abc12.logstash.searchTimes.length).toBe(1);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);

        count = search_module.tokenAndStatusCodeCount(req, res, 5);
        // status count has increased by one
        expect(count.abc12.logstash['200']).toBe(2);
        // searchTimes has added a second time without changing the first
        expect(count.abc12.logstash.searchTimes.length).toBe(2);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);
        expect(count.abc12.logstash.searchTimes[1]).toBe(5);

        count = search_module.tokenAndStatusCodeCount(req, res, 7);
        // status count has increased by one
        expect(count.abc12.logstash['200']).toBe(3);
        // searchTimes has added a third time without changing the others
        expect(count.abc12.logstash.searchTimes.length).toBe(3);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);
        expect(count.abc12.logstash.searchTimes[1]).toBe(5);
        expect(count.abc12.logstash.searchTimes[2]).toBe(7);

        res = { statusCode: 300};
        count = search_module.tokenAndStatusCodeCount(req, res, 2);
        // check that new statusCode is a property of apiEndpoint
        expect(count.abc12.logstash['300']).toBeDefined();
        // statusCode value is the count of this statusCode
        expect(count.abc12.logstash['300']).toBe(1);
        // searchTimes has added a third time without changing the others
        expect(count.abc12.logstash.searchTimes.length).toBe(4);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);
        expect(count.abc12.logstash.searchTimes[3]).toBe(2);

        count = search_module.tokenAndStatusCodeCount(req, res, 12);
        // statusCode value is the count of this statusCode
        expect(count.abc12.logstash['300']).toBe(2);
        // searchTimes has added a third time without changing the others
        expect(count.abc12.logstash.searchTimes.length).toBe(5);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);
        expect(count.abc12.logstash.searchTimes[4]).toBe(12);

        res = { statusCode: 500};
        count = search_module.tokenAndStatusCodeCount(req, res, undefined);
        // check that new statusCode is a property of apiEndpoint
        expect(count.abc12.logstash['500']).toBeDefined();
        // statusCode value is the count of this statusCode
        expect(count.abc12.logstash['500']).toBe(1);
        // searchTimes has added a third time without changing the others
        expect(count.abc12.logstash.searchTimes.length).toBe(6);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);
        expect(count.abc12.logstash.searchTimes[5]).toBe(undefined);

        count = search_module.tokenAndStatusCodeCount(req, res, undefined);
        // statusCode value is the count of this statusCode
        expect(count.abc12.logstash['500']).toBe(2);
        // searchTimes has added a third time without changing the others
        expect(count.abc12.logstash.searchTimes.length).toBe(7);
        expect(count.abc12.logstash.searchTimes[0]).toBe(10);
        expect(count.abc12.logstash.searchTimes[6]).toBe(undefined);

        req = { user: { api_token: 'def123dabdsioueadbs23423' },
                _parsedOriginalUrl: { pathname: 'api/v1/otherstash' }
                 };
        res = { statusCode: 200};
        count = search_module.tokenAndStatusCodeCount(req, res, 14);
        // api key is object property
        expect(count.def12).toBeDefined();
        // endpoint is property of api key
        expect(count.def12.otherstash).toBeDefined();
        // status is property of endpoint
        expect(count.def12.otherstash['200']).toBeDefined();
        // status value is the count
        expect(count.def12.otherstash['200']).toBe(1);
        // searchTimes is property of endpoint
        expect(count.def12.otherstash.searchTimes).toBeDefined();
        // searchTime contains one item with a value of 10
        expect(count.def12.otherstash.searchTimes.length).toBe(1);
        expect(count.def12.otherstash.searchTimes[0]).toBe(14);
        count = search_module.tokenAndStatusCodeCount(req, res, 34);
        expect(count.def12.otherstash['200']).toBe(2);
        expect(count.def12.otherstash.searchTimes.length).toBe(2);
        expect(count.def12.otherstash.searchTimes[1]).toBe(34);

        function moreRequests() {
            const apiTokens = [ 'ghi12334', 'jkl345234', 'ctr353532' ];
            const apiEndPoints = [ 'logstash', 'logbash', 'bobrash' ];
            const apiStatusCodes = [ 200, 300, 500 ];

            apiTokens.forEach(token => {
                req.user.api_token = token;
                apiEndPoints.forEach(endpoint => {
                    req._parsedOriginalUrl.pathname = 'api/v1/' + endpoint;
                    apiStatusCodes.forEach(statusCode => {
                        res.statusCode = statusCode;
                        let i = 0;
                        for(i; i < 10; i += 1){
                            count = search_module.tokenAndStatusCodeCount(req, res, 5);
                        }
                    });
                });
            });
        }
        moreRequests();
        // api keys are properties of count
        expect(count.ghi12).toBeDefined();
        expect(count.jkl34).toBeDefined();
        expect(count.ctr35).toBeDefined();
        // endpoint is property of api key
        expect(count.ghi12.logstash).toBeDefined();
        expect(count.ghi12.logbash).toBeDefined();
        expect(count.ghi12.bobrash).toBeDefined();
        expect(count.jkl34.logstash).toBeDefined();
        expect(count.jkl34.logbash).toBeDefined();
        expect(count.jkl34.bobrash).toBeDefined();
        expect(count.ctr35.logstash).toBeDefined();
        expect(count.ctr35.logbash).toBeDefined();
        expect(count.ctr35.bobrash).toBeDefined();
        // status is property of endpoint
        expect(count.ghi12.logstash['200']).toBeDefined();
        expect(count.ghi12.logstash['300']).toBeDefined();
        expect(count.ghi12.logstash['500']).toBeDefined();
        expect(count.ghi12.bobrash['200']).toBeDefined();
        expect(count.ghi12.bobrash['300']).toBeDefined();
        expect(count.ghi12.bobrash['500']).toBeDefined();
        expect(count.ghi12.logbash['200']).toBeDefined();
        expect(count.ghi12.logbash['300']).toBeDefined();
        expect(count.ghi12.logbash['500']).toBeDefined();
        expect(count.jkl34.logstash['200']).toBeDefined();
        expect(count.jkl34.logstash['300']).toBeDefined();
        expect(count.jkl34.logstash['500']).toBeDefined();
        expect(count.jkl34.bobrash['200']).toBeDefined();
        expect(count.jkl34.bobrash['300']).toBeDefined();
        expect(count.jkl34.bobrash['500']).toBeDefined();
        expect(count.jkl34.logbash['200']).toBeDefined();
        expect(count.jkl34.logbash['300']).toBeDefined();
        expect(count.jkl34.logbash['500']).toBeDefined();
        // searchTime contains the number of searches
        expect(count.ghi12.logstash.searchTimes.length).toBe(30);
        expect(count.jkl34.logstash.searchTimes.length).toBe(30);
        expect(count.ctr35.logstash.searchTimes.length).toBe(30);
        expect(count.ghi12.logbash.searchTimes.length).toBe(30);
        expect(count.jkl34.logbash.searchTimes.length).toBe(30);
        expect(count.ctr35.logbash.searchTimes.length).toBe(30);
        expect(count.ghi12.bobrash.searchTimes.length).toBe(30);
        expect(count.jkl34.bobrash.searchTimes.length).toBe(30);
        expect(count.ctr35.bobrash.searchTimes.length).toBe(30);
    });
});
