'use strict';

var _ = require('lodash');
const http = require('http');
var search_module = require('../lib/count_searches');


describe('teraserver search analytics module', function() {
    it('query responses are aggregated', function() {
        let req = {user: { api_token: 'abc123dabdsioueadbs23423' },
                     _parsedOriginalUrl: { pathname: 'api/v1/logstash' }
                 };
        let res = { statusCode: 200};
        let count = search_module().tokenAndStatusCodeCount(req, res, 10);

        // api key is object property
        expect(count.abc12).toBeDefined();
        // endpoint is property of api key
        expect(count.abc12['api/v1/logstash']).toBeDefined();
        // status is property of endpoint
        expect(count.abc12['api/v1/logstash']['200']).toBeDefined();
        // status value is the count
        expect(count.abc12['api/v1/logstash']['200']).toBe(1);
        // searchTimes is property of endpoint
        expect(count.abc12['api/v1/logstash'].searchTimes).toBeDefined();
        // searchTime contains one item with a value of 10
        expect(count.abc12['api/v1/logstash'].searchTimes.length).toBe(1);
        expect(count.abc12['api/v1/logstash'].searchTimes[0]).toBe(10);

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
                            count = search_module().tokenAndStatusCodeCount(req, res, 5);
                        }
                    });
                });
            });
        }
        manyRequests();
        // api keys are properties of count
        expect(count.ghi12).toBeDefined();
        expect(count.jkl34).toBeDefined();
        expect(count.ctr35).toBeDefined();
        // endpoint is property of api key
        expect(count.ghi12['api/v1/logstash']).toBeDefined();
        expect(count.ghi12['api/v1/logbash']).toBeDefined();
        expect(count.ghi12['api/v1/bobrash']).toBeDefined();
        expect(count.jkl34['api/v1/logstash']).toBeDefined();
        expect(count.jkl34['api/v1/logbash']).toBeDefined();
        expect(count.jkl34['api/v1/bobrash']).toBeDefined();
        expect(count.ctr35['api/v1/logstash']).toBeDefined();
        expect(count.ctr35['api/v1/logbash']).toBeDefined();
        expect(count.ctr35['api/v1/bobrash']).toBeDefined();
        // status is property of endpoint
        expect(count.ghi12['api/v1/logstash']['200']).toBeDefined();
        expect(count.ghi12['api/v1/logstash']['300']).toBeDefined();
        expect(count.ghi12['api/v1/logstash']['500']).toBeDefined();
        expect(count.ghi12['api/v1/bobrash']['200']).toBeDefined();
        expect(count.ghi12['api/v1/bobrash']['300']).toBeDefined();
        expect(count.ghi12['api/v1/bobrash']['500']).toBeDefined();
        expect(count.ghi12['api/v1/logbash']['200']).toBeDefined();
        expect(count.ghi12['api/v1/logbash']['300']).toBeDefined();
        expect(count.ghi12['api/v1/logbash']['500']).toBeDefined();
        expect(count.jkl34['api/v1/logstash']['200']).toBeDefined();
        expect(count.jkl34['api/v1/logstash']['300']).toBeDefined();
        expect(count.jkl34['api/v1/logstash']['500']).toBeDefined();
        expect(count.jkl34['api/v1/bobrash']['200']).toBeDefined();
        expect(count.jkl34['api/v1/bobrash']['300']).toBeDefined();
        expect(count.jkl34['api/v1/bobrash']['500']).toBeDefined();
        expect(count.jkl34['api/v1/logbash']['200']).toBeDefined();
        expect(count.jkl34['api/v1/logbash']['300']).toBeDefined();
        expect(count.jkl34['api/v1/logbash']['500']).toBeDefined();
        // searchTime contains the number of searches
        expect(count.ghi12['api/v1/logstash'].searchTimes.length).toBe(30);
        expect(count.jkl34['api/v1/logstash'].searchTimes.length).toBe(30);
        expect(count.ctr35['api/v1/logstash'].searchTimes.length).toBe(30);
        expect(count.ghi12['api/v1/logbash'].searchTimes.length).toBe(30);
        expect(count.jkl34['api/v1/logbash'].searchTimes.length).toBe(30);
        expect(count.ctr35['api/v1/logbash'].searchTimes.length).toBe(30);
        expect(count.ghi12['api/v1/bobrash'].searchTimes.length).toBe(30);
        expect(count.jkl34['api/v1/bobrash'].searchTimes.length).toBe(30);
        expect(count.ctr35['api/v1/bobrash'].searchTimes.length).toBe(30);
    });
});
