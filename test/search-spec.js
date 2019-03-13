'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

describe('teraserver search module', () => {
    const logger = {
        error() {},
        info() {},
        warn() {},
        trace() {},
        debug() {},
        flush() {}
    };

    const config = {
        context: {
            foundation: {
                makeLogger() {
                    return logger;
                },
                getConnection: () => ({
                    client: {
                        bulk: () => Promise.resolve({
                            items: []
                        })
                    }
                }),
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
        }
    };

    const searchModule = require('../lib/search')(config);

    it('can parse lucene queries and collect field names', () => {
        // returns an object with keys that are the fields
        const parser = searchModule.__test_context(config, '').luceneParser;
        const test1 = parser('a string');
        const test2 = parser('dog:brown');
        const test3 = parser('dog:brown AND cat:false');
        const test4 = parser('dog:brown NOT cat:true');
        const test5 = parser('url:http://google.com');
        const test6 = parser('ipv6:eae7:e4b5:3da6:fdb2:aa19:22e4:4dba:d356');

        expect(Object.keys(test1).length).toEqual(0);
        expect(test2.dog).toBeDefined();
        expect(test3.dog).toBeDefined();
        expect(test3.cat).toBeDefined();
        expect(test4.dog).toBeDefined();
        expect(test4.cat).toBeDefined();
        expect(test5.url).toBeDefined();
        expect(test6.ipv6).toBeDefined();
    });

    it('prepares date ranges for queries', () => {
        const { prepareDateRange } = searchModule.__test_context(config, 'created');
        const start = new Date().toISOString();
        const end = start;
        const results1 = { range: { created: { gte: start } } };
        const results2 = { range: { created: { gte: start, lte: end } } };

        expect(prepareDateRange()).toEqual(null);
        expect(prepareDateRange(start)).toEqual(results1);
        expect(prepareDateRange(start, end)).toEqual(results2);
        expect(prepareDateRange(null, end)).toEqual(null);
    });

    it('can verify if queries are ok', () => {
        const { properQuery } = searchModule.__test_context(config, 'created');
        const re = RegExp('[^\\s]*.*:[\\s]*[\\*\\?](.*)');

        const query1 = 'url:https://*';
        const query2 = 'url:https://d*';
        const query3 = 'url:https:*';
        const query4 = 'url:https://* AND something:else';
        const query5 = 'ipv6:03d3*';
        const query6 = 'ipv6:03d3:*';
        const query7 = 'ipv6:03d3:sdg9::/28';
        const query8 = 'ipv6:03d3:sdg9::/28 NOT url:https://*';

        const badQuery1 = 'url:*asdfd';
        const badQuery2 = 'url:?asdf';

        expect(properQuery(query1, re)).toEqual(true);
        expect(properQuery(query2, re)).toEqual(true);
        expect(properQuery(query3, re)).toEqual(true);
        expect(properQuery(query4, re)).toEqual(true);
        expect(properQuery(query5, re)).toEqual(true);
        expect(properQuery(query6, re)).toEqual(true);
        expect(properQuery(query7, re)).toEqual(true);
        expect(properQuery(query8, re)).toEqual(true);

        expect(properQuery(badQuery1, re)).toEqual(false);
        expect(properQuery(badQuery2, re)).toEqual(false);
    });

    it('can validate date ranges', () => {
        const { validateDateRange } = searchModule.__test_context(config, 'created');
        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            }
        };
        const date = new Date();
        const start = date.toISOString();
        const end = new Date(date.getTime() + 100000).toISOString();

        // null, null is valid
        expect(validateDateRange(res, null, null)).toEqual(true);

        let err = null;
        try {
            validateDateRange(res, 'something', null);
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'date_start is not a valid ISO 8601 date' });

        err = null;
        try {
            validateDateRange(res, null, 'something');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'date_end is not a valid ISO 8601 date' });

        err = null;
        try {
            validateDateRange(res, end, start);
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'date_end is before date_start' });

        err = null;
        try {
            validateDateRange(res, null, end);
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'date_end provided without a corresponding date_start' });

        expect(validateDateRange(res, start, end)).toEqual(true);
    });

    it('index history', () => {
        const { indexHistory } = searchModule.__test_context(config, 'created');
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/gi, '.');
        const dateStr2 = new Date(date.setDate(date.getDate() - 1)).toISOString().slice(0, 10).replace(/-/gi, '.');
        // setDate mutates the date, so doing this for dateStr3 is setting it back 2 days
        const dateStr3 = new Date(date.setDate(date.getDate() - 1)).toISOString().slice(0, 10).replace(/-/gi, '.');


        expect(indexHistory(1, null, 'logstash')).toEqual(`logstash-${dateStr}*`);
        expect(indexHistory(2, null, 'logstash')).toEqual(`logstash-${dateStr}*,logstash-${dateStr2}*`);
        expect(indexHistory(2, 1, 'logstash')).toEqual(`logstash-${dateStr2}*,logstash-${dateStr3}*`);
    });

    it('createGeoPoint', () => {
        const { createGeoPoint } = searchModule.__test_context(config, 'created');

        expect(createGeoPoint('56.033, 89.839')).toEqual(['56.033', ' 89.839']);

        // higher order function checks and throws the appropriate error
        expect(createGeoPoint('not a geo point')).toEqual(['not a geo point']);
        expect(createGeoPoint('156.033, 89.839')).toEqual([]);
        expect(createGeoPoint('56.033, 189.839')).toEqual([]);
    });

    it('validGeoDistance', () => {
        const { validGeoDistance } = searchModule.__test_context(config, 'created');

        expect(validGeoDistance('56mi')).toEqual(true);
        expect(validGeoDistance('56yd')).toEqual(true);
        expect(validGeoDistance('56ft')).toEqual(true);
        expect(validGeoDistance('56km')).toEqual(true);
        expect(validGeoDistance('56m')).toEqual(true);

        expect(validGeoDistance('56 m')).toEqual(false);
        expect(validGeoDistance('asdfasdf')).toEqual(false);
    });

    it('preforms geo search', () => {
        const { geoSearch } = searchModule.__test_context(config, 'created');
        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            }
        };

        const req1 = { query: {} };
        const req2 = { query: { geo_box_top_left: '56,89', geo_point: '56,89' } };
        const req3 = { query: { geo_box_top_left: '56m' } };
        const req4 = { query: { geo_box_top_left: '56,89', geo_box_bottom_right: '56m' } };
        const req5 = { query: { geo_box_top_left: '56,89', geo_box_bottom_right: '57,92' } };
        const req6 = { query: { geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_unit: 'km' } };
        const req7 = { query: { geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_order: 'desc' } };
        const req8 = {
            query: {
                geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_unit: 'km', geo_sort_order: 'desc'
            }
        };
        const req9 = { query: { geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_point: '57,90' } };
        const req10 = {
            query: {
                geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_point: '57,90', geo_sort_unit: 'km', geo_sort_order: 'desc'
            }
        };
        const req11 = { query: { geo_point: '56,89' } };
        const req12 = { query: { geo_point: '56,89', geo_distance: '1000km' } };
        const req13 = {
            query: {
                geo_point: '56,89', geo_distance: '1000km', geo_sort_order: 'desc', geo_sort_unit: 'km'
            }
        };
        const req14 = { query: { geo_point: '56,89', geo_distance: '1000km', geo_sort_point: '57,90' } };

        expect(geoSearch(req1, res, 'location')).toEqual(false);


        let err = null;
        try {
            geoSearch(req2, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'geo_box and geo_distance queries can not be combined.' });

        err = null;
        try {
            geoSearch(req3, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'Invalid geo_box_top_left' });

        err = null;
        try {
            geoSearch(req4, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'Invalid geo_box_bottom_right' });

        expect(geoSearch(req5, res, 'location').query).toEqual({
            geo_bounding_box: {
                location: {
                    top_left: {
                        lat: '56',
                        lon: '89'
                    },
                    bottom_right: {
                        lat: '57',
                        lon: '92'
                    }
                }
            }
        });

        err = null;
        try {
            geoSearch(req6, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided' });

        try {
            geoSearch(req7, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided' });

        try {
            geoSearch(req8, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided' });

        const req9Results = geoSearch(req9, res, 'location');
        expect(req9Results.query).toEqual({
            geo_bounding_box: {
                location: {
                    top_left: {
                        lat: '56',
                        lon: '89'
                    },
                    bottom_right: {
                        lat: '57',
                        lon: '92'
                    }
                }
            }
        });
        expect(req9Results.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'asc', unit: 'm' } });

        const req10Results = geoSearch(req10, res, 'location');
        expect(req10Results.query).toEqual({
            geo_bounding_box: {
                location: {
                    top_left: {
                        lat: '56',
                        lon: '89'
                    },
                    bottom_right: {
                        lat: '57',
                        lon: '92'
                    }
                }
            }
        });
        expect(req10Results.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'desc', unit: 'km' } });

        try {
            geoSearch(req11, res, 'location');
        } catch (_err) { err = _err; }
        expect(err).toEqual({ code: 500, error: 'Both geo_point and geo_distance must be provided for a geo_point query.' });

        // This tests no user defined sort with default geo distance sort
        const req12Results = geoSearch(req12, res, 'location');
        expect(req12Results.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req12Results.sort).toEqual({ _geo_distance: { location: { lat: '56', lon: '89' }, order: 'asc', unit: 'm' } });

        // This tests a user defined sort preventing a default geo distance sort
        const req12Results2 = geoSearch(req12, res, 'location', 'someUserDefined:sort');
        expect(req12Results2.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req12Results2.sort).toBeUndefined();

        const req13Results = geoSearch(req13, res, 'location');
        expect(req13Results.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req13Results.sort).toEqual({ _geo_distance: { location: { lat: '56', lon: '89' }, order: 'desc', unit: 'km' } });

        const req14Results = geoSearch(req14, res, 'location');
        expect(req14Results.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req14Results.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'asc', unit: 'm' } });

        // This has both a user defined sort and a geo sort combination
        const req14Results2 = geoSearch(req14, res, 'location', 'someUserDefined:sort');
        expect(req14Results2.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req14Results2.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'asc', unit: 'm' } });
    });

    it('performs search can query', () => {
        const { performSearch } = searchModule.__test_context(config, 'created');

        const date = new Date();
        const dateStr = new Date(date.setDate(date.getDate() - 1)).toISOString();
        const dateStr2 = date.toISOString();

        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            }
        };

        let query;
        const myConfig = {
            es_client: {
                search(_query) {
                    query = _query;
                    return Promise.resolve([]);
                }
            }
        };

        const config2 = _.extend({ query: 'some:Query' }, myConfig);
        const config3 = _.extend({ date_range: true }, config2);
        const config4 = _.extend({ geo_field: 'location' }, config2);
        const config5 = _.extend({ sort_default: 'someDefault' }, myConfig);
        const config6 = _.extend({ sort_enabled: true, sort_dates_only: true }, myConfig);
        const config7 = _.extend({ allowed_fields: 'created' }, myConfig);
        const config8 = _.extend({ allowed_fields: 'otherField' }, myConfig);

        const req1 = { query: { size: 100000000 } };
        const req2 = { query: {} };
        const req3 = { query: { size: 1000 } };
        const req4 = { query: { date_start: dateStr, date_end: dateStr2 } };
        const req5 = { query: { geo_box_top_left: '56,89', geo_box_bottom_right: '57,92' } };
        const req6 = { query: { start: 12312412 } };
        const req7 = { query: { start: 12312412, type: 'events' } };
        const req8 = { query: { sort: 'someField:asc' } };
        const req9 = { query: { sort: 'created:adsfasd' } };
        const req10 = { query: { sort: 'created:asc' } };
        const req11 = { query: { fields: 'created' } };
        const req12 = { query: { size: 'some string' } };

        performSearch({}, req1, res, myConfig);
        expect(list.shift().error).toEqual('Request size too large. Must be less than 100000.');

        // default query
        performSearch({}, req2, res, myConfig);
        expect(query).toEqual({ body: { query: { bool: { must: [] } } }, size: 100 });

        performSearch({}, req3, res, myConfig);
        expect(query).toEqual({ body: { query: { bool: { must: [] } } }, size: 1000 });

        performSearch({}, req2, res, config2);
        expect(query).toEqual({ size: 100, body: { query: { bool: { must: ['some:Query'] } } } });

        performSearch({}, req4, res, config3);
        expect(query).toEqual({
            size: 100,
            body: {
                query: {
                    bool: {
                        must: ['some:Query', { range: { created: { gte: dateStr, lte: dateStr2 } } }]
                    }
                }
            }
        });

        performSearch({}, req5, res, config4);
        expect(query).toEqual({
            size: 100,
            body: {
                query: {
                    bool: {
                        must: [
                            'some:Query',
                            {
                                geo_bounding_box: {
                                    location: {
                                        top_left: { lat: '56', lon: '89' },
                                        bottom_right: { lat: '57', lon: '92' }
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        });

        performSearch({}, req6, res, myConfig);
        expect(query).toEqual({
            body: {
                query: {
                    bool: {
                        must: []
                    }
                }
            },
            size: 100,
            from: 12312412
        });

        performSearch({}, req7, res, config2);
        expect(query).toEqual({
            body: {
                query: {
                    bool: {
                        must: ['some:Query', { term: { type: 'events' } }]
                    }
                }
            },
            size: 100,
            from: 12312412
        });

        performSearch({}, req8, res, config5);
        expect(query).toEqual({ body: { query: { bool: { must: [] } } }, size: 100, sort: 'someDefault' });

        performSearch({}, req8, res, config6);
        expect(list.shift().error).toEqual("Invalid sort parameter. Sorting currently available for the 'created' field only.");

        performSearch({}, req9, res, config6);
        expect(list.shift().error).toEqual('Invalid sort parameter. Must be field_name:asc or field_name:desc.');

        performSearch({}, req10, res, config6);
        expect(query).toEqual({ body: { query: { bool: { must: [] } } }, size: 100, sort: 'created:asc' });

        performSearch({}, req11, res, config6);
        expect(query).toEqual({ body: { query: { bool: { must: [] } } }, size: 100, _sourceInclude: ['created'] });

        performSearch({}, req11, res, config7);
        expect(query).toEqual({ body: { query: { bool: { must: [] } } }, size: 100, _sourceInclude: ['created'] });

        performSearch({}, req11, res, config8);
        expect(list.shift().error).toEqual('the fields parameter does not contain any valid fields');

        performSearch({}, req12, res, config8);
        expect(list.shift().error).toEqual('size parameter must be a valid number, was given some string');
    });

    it('performs search can handle data and errors', (done) => {
        const { performSearch } = searchModule.__test_context(config, 'created');
        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            }
        };
        let responseData = {};

        const myConfig = {
            query: 'some:Query',
            es_client: {
                search() {
                    return Promise.resolve(responseData);
                }
            }
        };

        function callAndWait(...args) {
            return new Promise((resolve) => {
                performSearch(...args);
                setTimeout(() => {
                    resolve(true);
                }, 10);
            });
        }

        const config2 = _.extend({ preserve_index_name: true }, myConfig);
        const req1 = { query: { size: 10000 } };

        Promise.resolve()
            .then(() => {
                responseData.error = 'an erorr occured';
                return callAndWait({}, req1, res, myConfig);
            })
            .then(() => {
                expect(list.shift().error).toEqual('Error during query execution.');
                responseData = { hits: false };
                return callAndWait({}, req1, res, myConfig);
            })
            .then(() => {
                expect(list.shift().error).toEqual('No results returned from query.');
                responseData = { hits: { hits: [], total: 0 } };
                return callAndWait({}, req1, res, myConfig);
            })
            .then(() => {
                const data = list.shift();
                expect(data.results).toEqual([]);
                responseData = { hits: { hits: [{ _source: { some: 'data' } }, { _source: { some: 'otherData' } }], total: 2 } };
                return callAndWait({}, req1, res, myConfig);
            })
            .then(() => {
                const data = list.shift();
                expect(data.results).toEqual([{ some: 'data' }, { some: 'otherData' }]);
                responseData = { hits: { hits: [{ _index: 'index', _source: { some: 'data' } }, { _index: 'index', _source: { some: 'otherData' } }], total: 2 } };
                return callAndWait({}, req1, res, config2);
            })
            .then(() => {
                const data = list.shift();
                expect(data.results).toEqual([{ some: 'data', _index: 'index' }, { some: 'otherData', _index: 'index' }]);
            })
            .catch(fail)
            .finally(done);
    });

    it('lucene query', () => {
        const { luceneQuery } = searchModule.__test_context(config, 'created');
        const index = 'some_index';
        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            }
        };

        let query;
        const myConfig = {
            es_client: {
                search(_query) {
                    query = _query;
                    return Promise.resolve(false);
                }
            }
        };

        const config2 = _.extend({ allowed_fields: 'some' }, myConfig);
        const config3 = _.extend({ allowed_fields: 'other' }, myConfig);

        const req1 = {};
        const req2 = { query: { q: 'some:*Query' } };
        const req3 = { query: { q: 'some:?Query' } };
        const req4 = { query: { q: 'some:*' } };
        const req5 = { query: { q: 'some:Query' } };


        luceneQuery(req1, res, index, myConfig);
        expect(list.shift().error).toEqual('Search query must be specified in the query parameter q.');

        luceneQuery(req2, res, index, myConfig);
        expect(list.shift().error).toEqual("Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'.");

        luceneQuery(req3, res, index, myConfig);
        expect(list.shift().error).toEqual("Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'.");

        luceneQuery(req4, res, index, myConfig);
        expect(list.shift().error).toEqual("Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'.");

        luceneQuery(req5, res, index, myConfig);
        expect(query).toEqual({
            index: 'some_index',
            ignoreUnavailable: true,
            body: { query: { bool: { must: [{ query_string: { default_field: '', query: 'some:Query' } }] } } },
            size: 100
        });

        luceneQuery(req5, res, index, config2);
        expect(query).toEqual({
            index: 'some_index',
            ignoreUnavailable: true,
            body: { query: { bool: { must: [{ query_string: { default_field: '', query: 'some:Query' } }] } } },
            size: 100,
            _sourceInclude: 'some'
        });

        luceneQuery(req5, res, index, config3);
        expect(list.shift().error).toEqual('you cannot query on these terms: some');
    });

    it('lucene with history query', () => {
        const { luceneWithHistoryQuery } = searchModule.__test_context(config, 'created');

        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/gi, '.');
        const dateStr2 = new Date(date.setDate(date.getDate() - 1)).toISOString().slice(0, 10).replace(/-/gi, '.');

        const indexes1 = 'some_index';
        const indexes2 = 'some_index, other_index';

        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            }
        };

        let query;
        const myConfig = {
            es_client: {
                search(_query) {
                    query = _query;
                    return Promise.resolve(false);
                }
            },
            history_prefix: 'logscope-'
        };

        const req1 = { query: { q: 'some:Query', history: 1, history_start: 0 } };
        const req2 = { query: { q: 'some:Query', history: 1, history_start: 'asdfa' } };
        const req3 = { query: { q: 'some:Query', history: 'asdfs', history_start: 0 } };
        const req4 = { query: { q: 'some:Query', history: -21, history_start: 0 } };
        const req5 = { query: { q: 'some:Query', history: 1, history_start: -21 } };
        const req6 = { query: { q: 'some:Query', history: 61, history_start: 231 } };
        const req7 = { query: { q: 'some:Query', history: 2, history_start: 0 } };


        luceneWithHistoryQuery(req1, res, indexes1, myConfig);
        expect(query).toEqual({
            index: `${myConfig.history_prefix + dateStr}*`,
            ignoreUnavailable: true,
            body: { query: { bool: { must: [{ query_string: { default_field: '', query: 'some:Query' } }] } } },
            size: 100
        });

        luceneWithHistoryQuery(req2, res, indexes1, myConfig);
        expect(list.shift().error).toEqual('History specification must be numeric.');

        luceneWithHistoryQuery(req3, res, indexes1, myConfig);
        expect(list.shift().error).toEqual('History specification must be numeric.');

        luceneWithHistoryQuery(req4, res, indexes1, myConfig);
        expect(list.shift().error).toEqual('History specification must be a positive number.');

        luceneWithHistoryQuery(req5, res, indexes1, myConfig);
        expect(list.shift().error).toEqual('History specification must be a positive number.');

        luceneWithHistoryQuery(req6, res, indexes1, myConfig);
        expect(list.shift().error).toEqual('History is not available beyond 90 days.');

        luceneWithHistoryQuery(req7, res, indexes2, myConfig);
        expect(query).toEqual({
            index: `${myConfig.history_prefix + dateStr}*,${myConfig.history_prefix}${dateStr2}*`,
            ignoreUnavailable: true,
            body: { query: { bool: { must: [{ query_string: { default_field: '', query: 'some:Query' } }] } } },
            size: 100
        });
    });

    it('can post_process docs and pre_process queries', async () => {
        const { performSearch } = searchModule.__test_context(config, 'created');
        const date = new Date().toISOString();
        const list = [];
        const res = {
            status() {
                return this;
            },
            json(val) {
                list.push(val);
            },
            set() {
                return this;
            },
            send(val) {
                list.push(JSON.parse(val));
            }
        };

        const data = [{ _source: { some: 'data' } }, { _source: { some: 'other data' } }];

        const elasticResponse = {
            hits: {
                total: 2,
                hits: data
            }
        };

        let query;
        const myConfig = {
            es_client: {
                search(_query) {
                    query = _query;
                    return Promise.resolve(elasticResponse);
                }
            }
        };

        function upperCase(results) {
            return results.map((doc) => {
                doc.some = doc.some.toUpperCase();
                return doc;
            });
        }

        function addDates(reqQuery, reqConfig) {
            if (!reqConfig.date_range) {
                reqConfig.date_range = true;
                reqQuery.date_start = date;
                reqQuery.date_end = date;
            }
            return reqQuery;
        }

        function changeStart(reqQuery) {
            reqQuery.start = 100;
            return reqQuery;
        }

        const config2 = _.extend({ post_process: upperCase }, myConfig);
        const config3 = _.extend({ pre_process: changeStart }, myConfig);
        const config4 = _.extend({ pre_process: addDates }, myConfig);

        function getReq() {
            return { query: { size: 100 } };
        }

        await performSearch({}, getReq(), res, myConfig);
        const results1 = list.pop();

        expect(results1).toEqual({
            info: '2 results found.',
            total: 2,
            returning: 2,
            results: data.map(obj => obj._source)
        });

        await performSearch({}, getReq(), res, config2);
        const results2 = list.pop();

        expect(results2).toEqual({
            info: '2 results found.',
            total: 2,
            returning: 2,
            results: upperCase(data.map(obj => obj._source))
        });

        await performSearch({}, getReq(), res, config3);
        list.pop();

        expect(query).toEqual({
            body: {
                query: {
                    bool: {
                        must: []
                    }
                }
            },
            size: 100,
            from: 100
        });

        await performSearch({}, getReq(), res, config4);
        list.pop();

        expect(query).toEqual({
            body: {
                query: {
                    bool: {
                        must: [{
                            range: {
                                created: {
                                    gte: date,
                                    lte: date
                                }
                            }
                        }]
                    }
                }
            },
            size: 100,
        });
    });
});
