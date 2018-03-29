'use strict';

var _ = require('lodash');
const http = require('http');



describe('teraserver search analytics module', function() {
    const context = { foundation: 'getConnection',
                      sysconfig: {
                          teraserver: {
                               stats: {
                                   service: 'api',
                                   es_connection: 'default' }
                               },
                        _nodeName: 'this.is.mylaptop.1'
                           }
                       };

    var search_module = require('../lib/search_counter')(context);

    let req = {user: { api_token: 'abc123dabdsioueadbs23423' },
               _parsedOriginalUrl: { pathname: 'api/v1/logstash' }
    };
    let res = {};
    let counter = {};

    // simulates 270 total api search requests with 3 different tokens, endpoints, and status codes
    function manyRequests() {
        const apiTokens = [ 'ghi12334', 'jkl345234', 'ctr353532' ];
        const apiEndpoints = [ 'logstash', 'logbash', 'bobrash' ];
        const apiStatusCodes = [ 200, 300, 500 ];

        apiTokens.forEach(token => {
            req.user.api_token = token;
            apiEndpoints.forEach(endpoint => {
                req._parsedOriginalUrl.pathname = 'api/v1/' + endpoint;
                apiStatusCodes.forEach(statusCode => {
                    res.statusCode = statusCode;
                    let i = 0;
                    for(i; i < 10; i += 1){
                        counter = search_module.tokenAndStatusCodeCount(req, res, 5);
                    }
                });
            });
        });
    }

    it('query responses are aggregated', function() {
        res = { statusCode: 200};
        counter = search_module.tokenAndStatusCodeCount(req, res, 10);

        // apiToken, apiEndpoint, status combine for the counter property
        expect(counter['abc12-api/v1/logstash-200']).toBeDefined();
        expect(counter['abc12-api/v1/logstash-200']).toBe(1);
        expect(counter['abc12-api/v1/logstash']).toBeDefined();
        expect(counter['abc12-api/v1/logstash'][0]).toBe(10);
        manyRequests();

        /// apiToken, apiEndpoint, status combine for the counter property
        expect(counter['ghi12-api/v1/logstash-200']).toBeDefined();
        expect(counter['jkl34-api/v1/logstash-300']).toBeDefined();
        expect(counter['ctr35-api/v1/logstash-500']).toBeDefined();
        expect(counter['ctr35-api/v1/logbash-200']).toBeDefined();
        expect(counter['ghi12-api/v1/logbash-300']).toBeDefined();
        expect(counter['jkl34-api/v1/logbash-500']).toBeDefined();
        expect(counter['jkl34-api/v1/bobrash-200']).toBeDefined();
        expect(counter['ctr35-api/v1/bobrash-300']).toBeDefined();
        expect(counter['ghi12-api/v1/bobrash-500']).toBeDefined();
        // check that counts are correct
        expect(counter['ghi12-api/v1/logstash-200']).toBe(10);
        expect(counter['jkl34-api/v1/logstash-300']).toBe(10);
        expect(counter['ctr35-api/v1/logstash-500']).toBe(10);
        expect(counter['ctr35-api/v1/logbash-200']).toBe(10);
        expect(counter['ghi12-api/v1/logbash-300']).toBe(10);
        expect(counter['jkl34-api/v1/logbash-500']).toBe(10);
        expect(counter['jkl34-api/v1/bobrash-200']).toBe(10);
        expect(counter['ctr35-api/v1/bobrash-300']).toBe(10);
        expect(counter['ghi12-api/v1/bobrash-500']).toBe(10);
        // apiToken, apiEndpoint are the counter property
        expect(counter['ghi12-api/v1/logstash']).toBeDefined();
        expect(counter['jkl34-api/v1/logstash']).toBeDefined();
        expect(counter['ctr35-api/v1/logstash']).toBeDefined();
        expect(counter['ctr35-api/v1/logbash']).toBeDefined();
        expect(counter['ghi12-api/v1/logbash']).toBeDefined();
        expect(counter['jkl34-api/v1/logbash']).toBeDefined();
        expect(counter['jkl34-api/v1/bobrash']).toBeDefined();
        expect(counter['ctr35-api/v1/bobrash']).toBeDefined();
        expect(counter['ghi12-api/v1/bobrash']).toBeDefined();
        // status is property of endpoint
        expect(counter['ghi12-api/v1/logstash'].length).toBe(30);
        expect(counter['jkl34-api/v1/logstash'].length).toBe(30);
        expect(counter['ctr35-api/v1/logstash'].length).toBe(30);
        expect(counter['ctr35-api/v1/logbash'].length).toBe(30);
        expect(counter['ghi12-api/v1/logbash'].length).toBe(30);
        expect(counter['jkl34-api/v1/logbash'].length).toBe(30);
        expect(counter['jkl34-api/v1/bobrash'].length).toBe(30);
        expect(counter['ctr35-api/v1/bobrash'].length).toBe(30);
        expect(counter['ghi12-api/v1/bobrash'].length).toBe(30);
    });

    it('avgTime function takes an array of numbers and returns the average, rounded up', function() {
        const numsArray1 = [1, 2, 3, 4, 5];
        const numsArray2 = [13, 34, 23, 100, 102];
        expect(search_module.__test_context()._avgTime(numsArray1)).toBe(3);
        expect(search_module.__test_context()._avgTime(numsArray2)).toBe(55);
    });

    it('formatedDate returns month.date from ISO string', function() {
        const date = '2018-03-28T20:25:34.708Z'
        expect(search_module.__test_context()._formattedDate(date)).toBe('2018.03');
    });

    it('bulkRequests create a proper es bulk request array', function () {
        manyRequests();
        const results = search_module.__test_context()._bulkRequests();
        // 28 different search points to count (27 from manyRequests and 1 solo)
        // 10 different timer points ( 9 from manyRequests, 1 solo)
        // 38 total records + a header for each record = 76 total objects in bulk array
        expect(results.length).toBe(76);
        expect(results[0].index).toBeDefined();
        expect(results[0].index._index).toBeDefined();
        expect(results[0].index._type).toBeDefined();
        expect(results[1].date).toBeDefined();
        expect(results[1].node).toBeDefined();
        expect(results[1].service).toBeDefined();
        expect(results[1].worker).toBeDefined();
        expect(results[1].token).toBeDefined();
        expect(results[1].endpoint).toBeDefined();
    });

    it('flush should reset the counter to 0', function(){
        expect(Object.keys(counter).length).toBe(38);
        search_module.__test_context()._resetCounter();
        res = { statusCode: 200};
        counter = search_module.tokenAndStatusCodeCount(req, res, 10);
        expect(Object.keys(counter).length).toBe(2);
    });

    it('bulkRequest should know the difference between a counter and a timer', function(){
        search_module.__test_context()._resetCounter();
        res = { statusCode: 200};
        search_module.tokenAndStatusCodeCount(req, res, 10);
        const results = search_module.__test_context()._bulkRequests();
        expect(results[0].index._type).toBe('counter');
        expect(results[2].index._type).toBe('timer');
    });

    // access the es connection
    // logging?
    // test data is pushed into es
    // test that interval is working
    // test errors

});
