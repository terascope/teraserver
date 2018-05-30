'use strict';

const Promise = require('bluebird');

describe('teraserver search analytics module', () => {
    let statusCode = 201;
    const errorCode = 'error';
    let errorMessage = '';

    function returnResults() {
        return {
            items: [{ index: { status: statusCode, error: errorCode } }]
        };
    }

    const context = {
        foundation: {
            getConnection: () => ({
                client: {
                    bulk: () => Promise.resolve(returnResults())
                }
            }),
            makeLogger: () => ({
                error: message => errorMessage = message
            })
        },
        sysconfig: {
            teraserver: {
                stats: {
                    service: 'api',
                    es_connection: 'default'
                }
            },
            _nodeName: 'this.is.mylaptop.1'
        }
    };

    let searchCounterModule = require('../lib/search_counter')(context);

    const req = {
        user: { api_token: 'abc123dabdsioueadbs23423' },
        _parsedOriginalUrl: { pathname: 'api/v1/logstash' }
    };
    const res = {};
    let counter = {};

    // simulates 270 total api search requests with 3 different tokens, endpoints, and status codes
    function manyRequests() {
        const apiTokens = ['ghi12334', 'jkl345234', 'ctr353532'];
        const apiEndpoints = ['logstash', 'logbash', 'bobrash'];
        const apiStatusCodes = [200, 300, 500];

        apiTokens.forEach((token) => {
            req.user.api_token = token;
            apiEndpoints.forEach((endpoint) => {
                req._parsedOriginalUrl.pathname = `api/v1/${endpoint}`;
                apiStatusCodes.forEach((_statusCode) => {
                    res.statusCode = _statusCode;
                    let i = 0;
                    for (i; i < 10; i += 1) {
                        counter = searchCounterModule.tokenAndStatusCodeCount(req, res, 5);
                    }
                });
            });
        });
    }

    it('avgTime function takes an array of numbers and returns the rounded up average', () => {
        const numsArray1 = [1, 2, 3, 4, 5];
        const numsArray2 = [13, 34, 23, 100, 102];
        const numsArray3 = [1, 2, 3, 4, undefined, 5, undefined];
        const numsArray4 = [undefined, undefined];

        expect(searchCounterModule.__test_context()._avgTime(numsArray1)).toBe(3);
        expect(searchCounterModule.__test_context()._avgTime(numsArray2)).toBe(55);
        expect(searchCounterModule.__test_context()._avgTime(numsArray3)).toBe(3);
        expect(searchCounterModule.__test_context()._avgTime(numsArray4)).toBe(0);
    });

    it('formatedDate returns month.date from ISO string', () => {
        const date = '2018-03-28T20:25:34.708Z';
        expect(searchCounterModule.__test_context()._formattedDate(date)).toBe('2018.03');
    });

    it('query responses are aggregated', () => {
        res.statusCode = 200;
        counter = searchCounterModule.tokenAndStatusCodeCount(req, res, 10);

        // apiToken, apiEndpoint, status combine for the counter property
        expect(counter['abc12-api/v1/logstash-200']).toBeDefined();
        expect(counter['abc12-api/v1/logstash-200']).toBe(1);
        expect(counter['abc12-api/v1/logstash']).toBeDefined();
        expect(counter['abc12-api/v1/logstash'].count).toBe(1);
        expect(counter['abc12-api/v1/logstash'].sum).toBe(10);
        manyRequests();

        // apiToken, apiEndpoint, status combine for the counter property
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
        // api endpoint has the correct count and sum of times
        expect(counter['ghi12-api/v1/logstash'].count).toBe(30);
        expect(counter['jkl34-api/v1/logstash'].count).toBe(30);
        expect(counter['ctr35-api/v1/logstash'].sum).toBe(150);
        expect(counter['ctr35-api/v1/logbash'].sum).toBe(150);
    });

    it('flush should reset the counter to 0', () => {
        expect(Object.keys(counter).length).toBe(38);
        searchCounterModule.__test_context()._resetCounter();
        res.statusCode = 200;
        counter = searchCounterModule.tokenAndStatusCodeCount(req, res, 10);
        expect(Object.keys(counter).length).toBe(2);
    });

    it('bulkRequests create a proper es bulk request array', () => {
        searchCounterModule.__test_context()._resetCounter();
        manyRequests();
        const results = searchCounterModule.__test_context()._bulkRequests();
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

    it('bulkRequest should know the difference between a counter and a timer', () => {
        searchCounterModule.__test_context()._resetCounter();
        res.statusCode = 200;
        searchCounterModule.tokenAndStatusCodeCount(req, res, 10);
        const results = searchCounterModule.__test_context()._bulkRequests();
        expect(results[1].type).toBe('counter');
        expect(results[3].type).toBe('timer');
    });

    it('test the bulk request error handling', (done) => {
        statusCode = 404;
        searchCounterModule.__test_context()._sendBulkRequestToEs()
            .then(() => {
                expect(errorMessage).toBe('Stats sync error from bulk insert: 404 error');
            })
            .finally(done);
    });

    it('test 500 status codes', () => {
        res.statusCode = 500;
        searchCounterModule.__test_context()._resetCounter();
        searchCounterModule.tokenAndStatusCodeCount(req, res, null);
        res.statusCode = 200;
        searchCounterModule.tokenAndStatusCodeCount(req, res, 10);
        searchCounterModule.tokenAndStatusCodeCount(req, res, 20);
        res.statusCode = 500;
        counter = searchCounterModule.tokenAndStatusCodeCount(req, res, null);
        const bulkArray = searchCounterModule.__test_context()._bulkRequests();
        expect(bulkArray[3].avg_time).toBe(15);
        expect(bulkArray[1].status).toBe('500');
        expect(bulkArray[3].status).toBe('200');
    });

    it('average time is correct', function() {
        res.statusCode = 200;
        search_counter_module.__test_context()._resetCounter();
        search_counter_module.tokenAndStatusCodeCount(req, res, 38);
        search_counter_module.tokenAndStatusCodeCount(req, res, 72);
        search_counter_module.tokenAndStatusCodeCount(req, res, 12);
        search_counter_module.tokenAndStatusCodeCount(req, res, 124);
        search_counter_module.tokenAndStatusCodeCount(req, res, 235);
        const bulkArray = search_counter_module.__test_context()._bulkRequests();
        expect(bulkArray[3].avg_time).toBe(97);    
    });

    it('test that if no stats in config the counts do not happen', () => {
        searchCounterModule.__test_context()._resetCounter();
        delete context.sysconfig.teraserver.stats;
        searchCounterModule = require('../lib/search_counter')(context);
        res.statusCode = 200;
        counter = searchCounterModule.tokenAndStatusCodeCount(req, res, 10);
        expect(Object.keys(counter).length).toBe(0);
    });
});
