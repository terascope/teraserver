'use strict';

var _ = require('lodash');
const Promise = require('bluebird');

describe('teraserver search module', function() {
    var config = {
        context: {
            foundation: {
                makeLogger: function() {
                },
                getConnection: (config) => {
                    return {
                        client: {
                            bulk: () => {
                                return Promise.resolve({
                                        items: [ ]
                                })
                            }
                        }
                    }
                },
            },
            sysconfig: {
                teraserver: {
                    stats: {
                        service: 'api',
                        es_connection: 'default' }
                        },
                _nodeName: 'this.is.mylaptop.1'
            }
        }
    };

    var search_module = require('../lib/search')(config);

    it('can parse lucene queries and collect field names', function() {
        //returns an object with keys that are the fields
        var parser = search_module.__test_context(config, '').luceneParser;
        var test1 = parser('a string');
        var test2 = parser('dog:brown');
        var test3 = parser('dog:brown AND cat:false');
        var test4 = parser('dog:brown NOT cat:true');
        var test5 = parser('url:http://google.com');
        var test6 = parser("ipv6:eae7:e4b5:3da6:fdb2:aa19:22e4:4dba:d356");

        expect(Object.keys(test1).length).toEqual(0);
        expect(test2.dog).toBeDefined();
        expect(test3.dog).toBeDefined();
        expect(test3.cat).toBeDefined();
        expect(test4.dog).toBeDefined();
        expect(test4.cat).toBeDefined();
        expect(test5.url).toBeDefined();
        expect(test6.ipv6).toBeDefined();
    });

    it('prepares date ranges for queries', function() {
        var prepareDateRange = search_module.__test_context(config, 'created').prepareDateRange;
        var start = new Date().toISOString();
        var end = start;

        expect(prepareDateRange()).toEqual(null);
        expect(prepareDateRange(start)).toEqual({"range": {"created": {"gte": start}}});
        expect(prepareDateRange(start, end)).toEqual({"range": {"created": {"gte": start, "lte": end}}});
        expect(prepareDateRange(null, end)).toEqual(null);
    });

    it('can verify if queries are ok', function() {
        var properQuery = search_module.__test_context(config, 'created').properQuery;
        var re = RegExp('[^\\s]*.*:[\\s]*[\\*\\?](.*)');

        var query1 = 'url:https://*';
        var query2 = 'url:https://d*';
        var query3 = 'url:https:*';
        var query4 = 'url:https://* AND something:else';
        var query5 = 'ipv6:03d3*';
        var query6 = 'ipv6:03d3:*';
        var query7 = 'ipv6:03d3:sdg9::/28';
        var query8 = 'ipv6:03d3:sdg9::/28 NOT url:https://*';

        var badQuery1 = 'url:*asdfd';
        var badQuery2 = 'url:?asdf';

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

    it('can validate date ranges', function() {
        var validateDateRange = search_module.__test_context(config, 'created').validateDateRange;
        var list = [];
        var res = {
            status: function() {
                return this
            },
            json: function(val) {
                list.push(val)
            }
        };
        var date = new Date();
        var start = date.toISOString();
        var end = new Date(date.getTime() + 100000).toISOString();

        //null, null is valid
        expect(validateDateRange(res, null, null)).toEqual(true);

        expect(() => validateDateRange(res, 'something', null))
            .toThrow({code: 500, error: 'date_start is not a valid ISO 8601 date'});

        expect(() => validateDateRange(res, null, 'something'))
            .toThrow({code: 500, error: 'date_end is not a valid ISO 8601 date'});

        expect(() => validateDateRange(res, end, start))
            .toThrow({code: 500, error: 'date_end is before date_start'});

        expect(() => validateDateRange(res, null, end))
            .toThrow({code: 500, error: 'date_end provided without a corresponding date_start'});

        expect(validateDateRange(res, start, end)).toEqual(true);
    });

    it('index history', function() {
        var indexHistory = search_module.__test_context(config, 'created').indexHistory;
        var date = new Date();
        var dateStr = date.toISOString().slice(0, 10).replace(/-/gi, '.');
        var dateStr2 = new Date(date.setDate(date.getDate() - 1)).toISOString().slice(0, 10).replace(/-/gi, '.');
        //setDate mutates the original date, so doing this for dateStr3 is setting it back 2 days from original
        var dateStr3 = new Date(date.setDate(date.getDate() - 1)).toISOString().slice(0, 10).replace(/-/gi, '.');


        expect(indexHistory(1, null, 'logstash')).toEqual('logstash-' + dateStr + '*');
        expect(indexHistory(2, null, 'logstash')).toEqual('logstash-' + dateStr + '*' + ',logstash-' + dateStr2 + '*');
        expect(indexHistory(2, 1, 'logstash')).toEqual('logstash-' + dateStr2 + '*' + ',logstash-' + dateStr3 + '*');

    });

    it('geo_point', function() {
        var geo_point = search_module.__test_context(config, 'created').geo_point;

        expect(geo_point('56.033, 89.839')).toEqual(['56.033', ' 89.839']);

        //higher order function checks and throws the appropriate error
        expect(geo_point('not a geo point')).toEqual(['not a geo point']);
        expect(geo_point('156.033, 89.839')).toEqual([]);
        expect(geo_point('56.033, 189.839')).toEqual([]);
    });

    it('valid_geo_distance', function() {
        var valid_geo_distance = search_module.__test_context(config, 'created').valid_geo_distance;

        expect(valid_geo_distance('56mi')).toEqual(true);
        expect(valid_geo_distance('56yd')).toEqual(true);
        expect(valid_geo_distance('56ft')).toEqual(true);
        expect(valid_geo_distance('56km')).toEqual(true);
        expect(valid_geo_distance('56m')).toEqual(true);

        expect(valid_geo_distance('56 m')).toEqual(false);
        expect(valid_geo_distance('asdfasdf')).toEqual(false);
    });

    it('preforms geo search', function() {
        var geoSearch = search_module.__test_context(config, 'created').geoSearch;
        var list = [];
        var res = {
            status: function() {
                return this
            },
            json: function(val) {
                list.push(val)
            }
        };

        var req1 = {query: {}};
        var req2 = {query: {geo_box_top_left: '56,89', geo_point: '56,89'}};
        var req3 = {query: {geo_box_top_left: '56m'}};
        var req4 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '56m'}};
        var req5 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92'}};
        var req6 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_unit: 'km'}};
        var req7 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_order: 'desc'}};
        var req8 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_unit: 'km', geo_sort_order: 'desc'}};
        var req9 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_point: '57,90'}};
        var req10 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92', geo_sort_point: '57,90', geo_sort_unit: 'km', geo_sort_order: 'desc'}};
        var req11 = {query: {geo_point: '56,89'}};
        var req12 = {query: {geo_point: '56,89', geo_distance: '1000km'}};
        var req13 = {query: {geo_point: '56,89', geo_distance: '1000km', geo_sort_order: 'desc', geo_sort_unit: 'km'}};
        var req14 = {query: {geo_point: '56,89', geo_distance: '1000km', geo_sort_point: '57,90'}};

        expect(geoSearch(req1, res, 'location')).toEqual(false);

        expect(() => geoSearch(req2, res, 'location'))
            .toThrow({code: 500, error: "geo_box and geo_distance queries can not be combined."});

        expect(() => geoSearch(req3, res, 'location'))
            .toThrow({code: 500, error: "Invalid geo_box_top_left"});

        expect(() => geoSearch(req4, res, 'location'))
            .toThrow({code: 500, error: "Invalid geo_box_bottom_right"});

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


        expect(() => geoSearch(req6, res, 'location'))
            .toThrow({code: 500, error: "bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided"});

        expect(() => geoSearch(req7, res, 'location'))
            .toThrow({code: 500, error: "bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided"});

        expect(() => geoSearch(req8, res, 'location'))
            .toThrow({code: 500, error: "bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided"});

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
        expect(req9Results.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'asc', unit: 'm' }});

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
        expect(req10Results.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'desc', unit: 'km' }});

        expect(() => geoSearch(req11, res, 'location'))
            .toThrow({code: 500, error: "Both geo_point and geo_distance must be provided for a geo_point query."});

        const req12Results = geoSearch(req12, res, 'location');
        expect(req12Results.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req12Results.sort).toEqual({ _geo_distance: { location: { lat: '56', lon: '89' }, order: 'asc', unit: 'm' } });

        const req13Results = geoSearch(req13, res, 'location');
        expect(req13Results.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req13Results.sort).toEqual({ _geo_distance: { location: { lat: '56', lon: '89' }, order: 'desc', unit: 'km' } });

        const req14Results = geoSearch(req14, res, 'location');
        expect(req14Results.query).toEqual({ geo_distance: { distance: '1000km', location: { lat: '56', lon: '89' } } });
        expect(req14Results.sort).toEqual({ _geo_distance: { location: { lat: '57', lon: '90' }, order: 'asc', unit: 'm' } });

    });

    it('performs search', function() {
        var performSearch = search_module.__test_context(config, 'created').performSearch;

        var date = new Date();
        var dateStr = new Date(date.setDate(date.getDate() - 1)).toISOString();
        var dateStr2 = date.toISOString();

        var list = [];
        var res = {
            status: function() {
                return this
            },
            json: function(val) {
                list.push(val)
            }
        };

        var query;
        var config = {
            es_client: {
                search: function(_query) {
                    query = _query;
                    return Promise.resolve(false);
                }
            }
        };

        var config2 = _.extend({query: 'some:Query'}, config);
        var config3 = _.extend({date_range: true}, config2);
        var config4 = _.extend({geo_field: 'location'}, config2);
        var config5 = _.extend({sort_default: 'someDefault'}, config);
        var config6 = _.extend({sort_enabled: true, sort_dates_only: true}, config);
        var config7 = _.extend({allowed_fields: 'created'}, config);
        var config8 = _.extend({allowed_fields: 'otherField'}, config);

        var req1 = {query: {size: 100000000}};
        var req2 = {query: {}};
        var req3 = {query: {size: 1000}};
        var req4 = {query: {date_start: dateStr, date_end: dateStr2}};
        var req5 = {query: {geo_box_top_left: '56,89', geo_box_bottom_right: '57,92'}};
        var req6 = {query: {start: 12312412}};
        var req7 = {query: {start: 12312412, type: 'events'}};
        var req8 = {query: {sort: 'someField:asc'}};
        var req9 = {query: {sort: 'created:adsfasd'}};
        var req10 = {query: {sort: 'created:asc'}};
        var req11 = {query: {fields: 'created'}};
        var req12 = {query: {size: 'some string'}};

        performSearch({}, req1, res, config)
        expect(list.shift().error).toEqual("Request size too large. Must be less than 100000.");

        //default query
        performSearch({}, req2, res, config);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 100});

        performSearch({}, req3, res, config);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 1000});

        performSearch({}, req2, res, config2);
        expect(query).toEqual({size: 100, body: {query: {bool: {must: ['some:Query']}}}});

        performSearch({}, req4, res, config3);
        expect(query).toEqual({
            size: 100,
            body: {
                query: {
                    bool: {
                        must: ['some:Query', {range: {created: {gte: dateStr, lte: dateStr2}}}]
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
                                        top_left: {lat: '56', lon: '89'},
                                        bottom_right: {lat: '57', lon: '92'}
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        });

        performSearch({}, req6, res, config);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 100, from: 12312412});

        performSearch({}, req7, res, config2);
        expect(query).toEqual({
            body: {
                query: {
                    bool: {
                        must: ['some:Query', {term: {type: 'events'}}]
                    }
                }
            },
            size: 100,
            from: 12312412
        });

        performSearch({}, req8, res, config5);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 100, sort: 'someDefault'});

        performSearch({}, req8, res, config6)
        expect(list.shift().error).toEqual("Invalid sort parameter. Sorting currently available for the 'created' field only.");

        performSearch({}, req9, res, config6)
        expect(list.shift().error).toEqual("Invalid sort parameter. Must be field_name:asc or field_name:desc.");

        performSearch({}, req10, res, config6);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 100, sort: 'created:asc'});

        performSearch({}, req11, res, config6);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 100, _sourceInclude: ['created']});

        performSearch({}, req11, res, config7);
        expect(query).toEqual({body: {query: {bool: {must: []}}}, size: 100, _sourceInclude: ['created']});

        performSearch({}, req11, res, config8)
        expect(list.shift().error).toEqual('the fields parameter does not contain any valid fields');

        performSearch({}, req12, res, config8)
        expect(list.shift().error).toEqual('size parameter must be a valid number, was given some string');
    });

    it('lucene query', function() {
        var luceneQuery = search_module.__test_context(config, 'created').luceneQuery;
        var index = 'some_index';
        var list = [];
        var res = {
            status: function() {
                return this
            },
            json: function(val) {
                list.push(val)
            }
        };

        var query;
        var config = {
            es_client: {
                search: function(_query) {
                    query = _query
                    return Promise.resolve(false);
                }
            }
        };

        var config2 = _.extend({allowed_fields: 'some'}, config);
        var config3 = _.extend({allowed_fields: 'other'}, config);

        var req1 = {};
        var req2 = {query: {q: 'some:*Query'}};
        var req3 = {query: {q: 'some:?Query'}};
        var req4 = {query: {q: 'some:*'}};
        var req5 = {query: {q: 'some:Query'}};


        luceneQuery(req1, res, index, config);
        expect(list.shift().error).toEqual("Search query must be specified in the query parameter q.");

        luceneQuery(req2, res, index, config);
        expect(list.shift().error).toEqual("Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'.");

        luceneQuery(req3, res, index, config);
        expect(list.shift().error).toEqual("Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'.");

        luceneQuery(req4, res, index, config);
        expect(list.shift().error).toEqual("Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'.");

        luceneQuery(req5, res, index, config);
        expect(query).toEqual({
            index: 'some_index',
            ignoreUnavailable: true,
            body: {query: {bool: {must: [{query_string: {default_field: '', query: 'some:Query'}}]}}},
            size: 100
        });

        luceneQuery(req5, res, index, config2);
        expect(query).toEqual({
            index: 'some_index',
            ignoreUnavailable: true,
            body: {query: {bool: {must: [{query_string: {default_field: '', query: 'some:Query'}}]}}},
            size: 100,
            _sourceInclude: 'some'
        });

        luceneQuery(req5, res, index, config3);
        expect(list.shift().error).toEqual('you cannot query on these terms: some');
    });

    it('lucene with history query', function() {
        var luceneWithHistoryQuery = search_module.__test_context(config, 'created').luceneWithHistoryQuery;

        var date = new Date();
        var dateStr = date.toISOString().slice(0, 10).replace(/-/gi, '.');
        var dateStr2 = new Date(date.setDate(date.getDate() - 1)).toISOString().slice(0, 10).replace(/-/gi, '.');

        var indexes1 = 'some_index';
        var indexes2 = 'some_index, other_index';

        var list = [];
        var res = {
            status: function() {
                return this
            },
            json: function(val) {
                list.push(val)
            }
        };

        var query;
        var config = {
            es_client: {
                search: function(_query) {
                    query = _query
                    return Promise.resolve(false);
                }
            },
            history_prefix: 'logscope-'
        };

        var req1 = {query: {q: 'some:Query', history: 1, history_start: 0}};
        var req2 = {query: {q: 'some:Query', history: 1, history_start: 'asdfa'}};
        var req3 = {query: {q: 'some:Query', history: 'asdfs', history_start: 0}};
        var req4 = {query: {q: 'some:Query', history: -21, history_start: 0}};
        var req5 = {query: {q: 'some:Query', history: 1, history_start: -21}};
        var req6 = {query: {q: 'some:Query', history: 61, history_start: 231}};
        var req7 = {query: {q: 'some:Query', history: 2, history_start: 0}};


        luceneWithHistoryQuery(req1, res, indexes1, config);
        expect(query).toEqual({
            index: config.history_prefix + dateStr + '*',
            ignoreUnavailable: true,
            body: {query: {bool: {must: [{query_string: {default_field: '', query: 'some:Query'}}]}}},
            size: 100
        });

        luceneWithHistoryQuery(req2, res, indexes1, config);
        expect(list.shift().error).toEqual("History specification must be numeric.");

        luceneWithHistoryQuery(req3, res, indexes1, config);
        expect(list.shift().error).toEqual("History specification must be numeric.");

        luceneWithHistoryQuery(req4, res, indexes1, config);
        expect(list.shift().error).toEqual("History specification must be a positive number.");

        luceneWithHistoryQuery(req5, res, indexes1, config);
        expect(list.shift().error).toEqual("History specification must be a positive number.");

        luceneWithHistoryQuery(req6, res, indexes1, config);
        expect(list.shift().error).toEqual("History is not available beyond 90 days.");

        luceneWithHistoryQuery(req7, res, indexes2, config);
        expect(query).toEqual({
            index: config.history_prefix + dateStr + '*,' + config.history_prefix + dateStr2 + '*',
            ignoreUnavailable: true,
            body: {query: {bool: {must: [{query_string: {default_field: '', query: 'some:Query'}}]}}},
            size: 100
        });
    });

});
