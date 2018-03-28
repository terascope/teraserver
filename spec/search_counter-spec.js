'use strict';

var _ = require('lodash');
const http = require('http');


describe('teraserver search analytics module', function() {
    const context = { sysconfig: { searchCounter: { service: 'api', esConnection: 'default'}}};
    var search_module = require('../lib/search_counter')(context);
    let req = {user: { api_token: 'abc123dabdsioueadbs23423' },
               _parsedOriginalUrl: { pathname: 'api/v1/logstash' }
    };

    it('query responses are aggregated', function() {
        let res = { statusCode: 200};
        let result = search_module.tokenAndStatusCodeCount(req, res, 10);
        let counter = result[0];
        let timer = result[1];

        // apiToken, apiEndpoint, status combine for the counter property
        expect(counter['abc12-api/v1/logstash-200']).toBeDefined();
        expect(counter['abc12-api/v1/logstash-200']).toBe(1);
        expect(timer['abc12-api/v1/logstash']).toBeDefined();
        expect(timer['abc12-api/v1/logstash'][0]).toBe(10);

        function manyRequests() {
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
                            result = search_module.tokenAndStatusCodeCount(req, res, 5);
                        }
                    });
                });
            });
        }
        manyRequests();
        counter = result[0];
        timer = result[1];

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
        // apiToken, apiEndpoint are the timer property
        expect(timer['ghi12-api/v1/logstash']).toBeDefined();
        expect(timer['jkl34-api/v1/logstash']).toBeDefined();
        expect(timer['ctr35-api/v1/logstash']).toBeDefined();
        expect(timer['ctr35-api/v1/logbash']).toBeDefined();
        expect(timer['ghi12-api/v1/logbash']).toBeDefined();
        expect(timer['jkl34-api/v1/logbash']).toBeDefined();
        expect(timer['jkl34-api/v1/bobrash']).toBeDefined();
        expect(timer['ctr35-api/v1/bobrash']).toBeDefined();
        expect(timer['ghi12-api/v1/bobrash']).toBeDefined();
        // status is property of endpoint
        expect(timer['ghi12-api/v1/logstash'].length).toBe(30);
        expect(timer['jkl34-api/v1/logstash'].length).toBe(30);
        expect(timer['ctr35-api/v1/logstash'].length).toBe(30);
        expect(timer['ctr35-api/v1/logbash'].length).toBe(30);
        expect(timer['ghi12-api/v1/logbash'].length).toBe(30);
        expect(timer['jkl34-api/v1/logbash'].length).toBe(30);
        expect(timer['jkl34-api/v1/bobrash'].length).toBe(30);
        expect(timer['ctr35-api/v1/bobrash'].length).toBe(30);
        expect(timer['ghi12-api/v1/bobrash'].length).toBe(30);
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
});
