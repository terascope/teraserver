'use strict';

var _ = require('lodash');
const Promise = require('bluebird');

describe('teraserver search analytics module', function() {
    let bodyTest = {};
    let statusCode = 201;
    let errorCode = 'error';
    let errorMessage = '';

    let context = {
        foundation: {
            getConnection: (config) => {
                return {
                    client: {
                        bulk: (body) => {
                            bodyTest = body;
                            return Promise.resolve({
                                    items:
                                        [ { index: {
                                                status: statusCode,
                                                error: errorCode
                                            } } ]
                            })
                        }
                    }
                }
            },
            makeLogger: (module) => {
                return {
                        error: (message) => {
                            errorMessage = message;
                        }
                    }
                }
        },
        sysconfig: {
                teraserver: {
                        stats: {
                            service: 'api',
                            es_connection: 'default' }
                               },
                        _nodeName: 'this.is.mylaptop.1'
                           }
                       };

    var search_counter_module = require('../lib/search_counter')(context);

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
                        counter = search_counter_module.tokenAndStatusCodeCount(req, res, 5);
                    }
                });
            });
        });
    }

    it('avgTime function takes an array of numbers and returns the rounded up average', function() {
        const numsArray1 = [1, 2, 3, 4, 5];
        const numsArray2 = [13, 34, 23, 100, 102];
        const numsArray3 = [1, 2, 3, 4, undefined, 5, undefined];
        const numsArray4 = [undefined, undefined];

        expect(search_counter_module.__test_context()._avgTime(numsArray1)).toBe(3);
        expect(search_counter_module.__test_context()._avgTime(numsArray2)).toBe(55);
        expect(search_counter_module.__test_context()._avgTime(numsArray3)).toBe(3);
        expect(search_counter_module.__test_context()._avgTime(numsArray4)).toBe(0);
    });

    it('formatedDate returns month.date from ISO string', function() {
        const date = '2018-03-28T20:25:34.708Z'
        expect(search_counter_module.__test_context()._formattedDate(date)).toBe('2018.03');
    });

    it('query responses are aggregated', function() {
        res = { statusCode: 200};
        counter = search_counter_module.tokenAndStatusCodeCount(req, res, 10);

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

    it('flush should reset the counter to 0', function(){
        expect(Object.keys(counter).length).toBe(38);
        search_counter_module.__test_context()._resetCounter();
        res = { statusCode: 200};
        counter = search_counter_module.tokenAndStatusCodeCount(req, res, 10);
        expect(Object.keys(counter).length).toBe(2);
    });

    it('bulkRequests create a proper es bulk request array', function () {
        search_counter_module.__test_context()._resetCounter();
        manyRequests();
        const results = search_counter_module.__test_context()._bulkRequests();
        // 27 different searches, 9 endpoints from timers x2 for the bulk index header
        expect(results.length).toBe(72);
        expect(results[0].index).toBeDefined();
        expect(results[0].index._index).toBeDefined();
        expect(results[0].index._type).toBeDefined();
        expect(results[1].date).toBeDefined();
        expect(results[1].node).toBeDefined();
        expect(results[1].service).toBeDefined();
        expect(results[1].worker).toBeDefined();
        expect(results[1].token).toBeDefined();
        expect(results[1].url).toBeDefined();
    });

    it('bulkRequest should know the difference between a counter and a timer', function(){
        search_counter_module.__test_context()._resetCounter();
        res = { statusCode: 200};
        search_counter_module.tokenAndStatusCodeCount(req, res, 10);
        const results = search_counter_module.__test_context()._bulkRequests();
        expect(results[1].type).toBe('counter');
        expect(results[3].type).toBe('timer');
    });

    it('test the bulk request error handling', function(done) {
        statusCode = 404;
        let returnedMessage;
        search_counter_module.__test_context()._sendBulkRequestToEs()
        .then(() => {
            expect(errorMessage).toBe('Stats sync error from bulk insert: 404 error')
        })
        .finally(done);
    });

    it('test 500 status codes', function() {
        let res = {
            statusCode: 500,
        };
        search_counter_module.__test_context()._resetCounter();
        search_counter_module.tokenAndStatusCodeCount(req, res, undefined);
        res.statusCode = 200;
        search_counter_module.tokenAndStatusCodeCount(req, res, 10);
        search_counter_module.tokenAndStatusCodeCount(req, res, 20);
        res.statusCode = 500;
        counter = search_counter_module.tokenAndStatusCodeCount(req, res, undefined);
        const bulkArray = search_counter_module.__test_context()._bulkRequests();
        expect(bulkArray[3].avg_time).toBe(15);
        expect(bulkArray[1].status).toBe('500');
        expect(bulkArray[5].status).toBe('200');

    });

    it('test that if no stats in config the counts do not happen', function() {
        search_counter_module.__test_context()._resetCounter();
        delete context.sysconfig.teraserver.stats;
        res = { statusCode: 200};
        counter = search_counter_module.tokenAndStatusCodeCount(req, res, 10);
        expect(Object.keys(counter).length).toBe(0);
    })
});
