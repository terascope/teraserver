'use strict';

var _ = require('lodash');


module.exports = function(appConfig, date_field) {
    var appConfig = appConfig;
    var date_field = date_field;
    var logger = appConfig.context.foundation.makeLogger('search_module', 'search_module', {module: 'teraserver_search'});  
    
    const searchCount = require('./search_counter')(appConfig.context);    
    
           
    /*
     TODO: This search functionality is fairly generic but assumes some field names
     date
     type
     */

    function error(code, message) {
        throw {
            code: code,
            error: message
        };
    }

    function validate(res, data, type, errField) {
        if (typeof data !== type) {
            error(500, "the " + errField + " parameter must be a " + type + ", was given: " + data);
        }
        return true;
    }

    function performSearch(context, req, res, config) {
        try{
            if (req.query.size) {
                var size = req.query.size;
                if (typeof size === "object" ) {
                    error(500, "size parameter must be a number, was given " + JSON.stringify(size));  
                }

                if (isNaN(Number.parseInt(size))) {
                    error(500, "size parameter must be a valid number, was given " + size);
                }
            }

            var max_query_size = config.max_query_size;
            if (! max_query_size) max_query_size = 100000;

            if (req.query.size && req.query.size > max_query_size) {
                error(500, "Request size too large. Must be less than " + max_query_size + ".");
            }

            context.body = {
                'query': {
                    'bool': {
                        'must': []
                    }
                }
            };

            var bool_clause = context.body.query.bool.must;

            // Setup the default query context
            if (config.query) {
                bool_clause.push(config.query);
            }

            if (config.date_range) {
                if (!validateDateRange(res, req.query.date_start, req.query.date_end)) {
                    return Promise.resolve(false);
                }
                var dateContext = prepareDateRange(req.query.date_start, req.query.date_end);
                if (dateContext) {
                    bool_clause.push(dateContext);
                }
            }

            // Geospatial support
            if (config.geo_field) {
                var geo_search = geoSearch(req, res, config.geo_field);
                if (geo_search === 500) {
                    // An error has already been sent so just return.
                    return Promise.resolve(false);
                }

                if (geo_search) {
                    if (geo_search.sort) context.body.sort = [geo_search.sort];
                    bool_clause.push(geo_search.query)
                }
            }

            context.size = 100;
            if (req.query.size) {
                context.size = req.query.size;
            }

            if (req.query.start) {
                if (isNaN(req.query.start)) {
                    error(500, "the start parameter must be a number, was given: " + req.query.start);
                }
                else {
                    context.from = req.query.start;
                }
            }

            // Parameter to retrieve a particular type of record
            if (req.query.type) {
                if (!validate(res, req.query.type, "string", "type")) return Promise.resolve(false);
                else {
                    bool_clause.push({
                        'term': {
                            'type': req.query.type
                        }
                    });
                }

            }

            // See if we should include a default sort
            if (config.sort_default) {
                context.sort = config.sort_default;
            }

            if (config.sort_enabled && req.query.sort) {
                // split the value and verify
                if (!validate(res, req.query.sort, "string", "sort")) return Promise.resolve(false);

                var pieces = req.query.sort.split(':');
                if (config.sort_dates_only && pieces[0].toLowerCase() !== date_field) {
                    error(500, "Invalid sort parameter. Sorting currently available for the '" + date_field + "' field only.");
                }

                if (pieces.length != 2 || (pieces[1].toLowerCase() != 'asc' && pieces[1].toLowerCase() != 'desc')) {
                    error(500, "Invalid sort parameter. Must be field_name:asc or field_name:desc.");
                }

                context.sort = req.query.sort;
            }
            var client = config.es_client;

            if (req.query.fields || config.allowed_fields) {

                if (req.query.fields && !validate(res, req.query.fields, "string", "fields")) return Promise.resolve(false);
                var finalFields;

                if (config.allowed_fields) {
                    finalFields = config.allowed_fields;
                }

                if (req.query.fields) {
                    var fields = req.query.fields.split(',');
                    finalFields = _.filter(fields, function(field) {
                        if (config.allowed_fields) {
                            if (config.allowed_fields.indexOf(field.trim()) !== -1) {
                                return true;
                            }
                            else {
                                return false;
                            }
                        }
                        else {
                            return true;
                        }
                    });

                    if (finalFields.length === 0) {
                        error(500, 'the fields parameter does not contain any valid fields');
                    }

                }

                context._sourceInclude = finalFields;
            }

            const searchResult = client.search(context);
            const start = Date.now();
            return searchResult.then(function(response, err) {
                if (response && response.error) {
                    logger.error("Search response error " + response.error);
                    res.status(500).json({error: 'Error during query execution.'});
                    searchCount.tokenAndStatusCodeCount(req, res, undefined);
                    return;
                }

                if (response.hits) {
                    var results = [];
                    for (var i = 0; i < response.hits.hits.length; i++) {
                        results.push(response.hits.hits[i]._source);
                    }

                    var message = response.hits.total + " results found.";
                    if (response.hits.total > context.size) {
                        message += " Returning " + context.size + "."
                    }

                    if (!config.sort_enabled && req.query.sort) {
                        message += " No sorting available."
                    }

                    if (config.post_process && typeof config.post_process === 'function') {
                        results = config.post_process(results)
                    }

                    var final_response = {
                        info: message,
                        total: response.hits.total,
                        returning: +context.size,
                        results: results
                    };

                    if (req.query.pretty === 'true') {
                        res
                            .set("Content-type", "application/json; charset=utf-8")
                            .send(JSON.stringify(final_response, null, 2));
                    }
                    else {
                        res.json(final_response);
                    }
                }
                else {
                    res.status(500).json({error: 'No results returned from query.'});
                    searchCount.tokenAndStatusCodeCount(req, res, undefined);
                    return;
                }
            })
            .then(() => {
                const end = Date.now();
                searchCount.tokenAndStatusCodeCount(req, res, end - start);
            })
            .catch(err => {
                logger.error("Search error " + err);
                res.status(500).json({error: 'Error during query execution.'});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            });
        }
        catch (err) {
            if (err.code && err.error) {
                res.status(err.code).json({ error: err.error });
                searchCount.tokenAndStatusCodeCount(req, res, undefined);              
            }
            else {
                res.status(500).json({ error: 'Unknown error' });
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
            }
        }
    }

    function luceneWithHistoryQuery(req, res, indexes, config) {
        // The user can restrict the query to just a subset of indices.
        // history is taken as "days back from current" or if history_start is
        // provided "days back from history_start.
        // TODO: this only works with daily indices
        if (req.query && req.query.history) {
            var start = 0;
            if (req.query.history_start) start = +req.query.history_start;

            var history = +req.query.history;
            if (Number.isNaN(history) || Number.isNaN(start)) {
                res.status(500).json({error: "History specification must be numeric."});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            }

            if (history < 0 || start < 0) {
                res.status(500).json({error: "History specification must be a positive number."});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            }

            if ((history + start) > 90) {
                res.status(500).json({error: "History is not available beyond 90 days."});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            }

            indexes = indexHistory(history, start, config.history_prefix);
        }

        luceneQuery(req, res, indexes, config);
    }

    function properQuery(lucQuery, re) {
        var parts = lucQuery.split(" ");
        return _.every(parts, function(str) {
            if (str.match(re)) {
                //checks for a colon, in-between zero and multiple characters and one or more colons
                if (str.match(/\:(?=.{0,40}\:+)/gi)) {
                    return true
                }
                return false;
            }
            else {
                //not a potential problem, so return true
                return true
            }
        })
    }

    function luceneQuery(req, res, index, config) {
        if (!req.query || !req.query.q) {
            if (config.require_query !== false) {
                res.status(500).json({error: "Search query must be specified in the query parameter q."});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            }
        }

        if (config.require_query === true && req.query.q) {
            if (!validate(res, req.query.q, "string", "query")) return;
        }
        //if require query is false, need to set to empty string to not break code
        var lucQuery = req.query.q ? req.query.q : '';

        // Verify the query string doesn't contain any forms that we need to block
        var re = RegExp('[^\\s]*.*:[\\s]*[\\*\\?](.*)');
        if (re.test(lucQuery)) {
            if (!properQuery(lucQuery, re)) {
                res.status(500).json({error: "Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'."});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            }
        }

        if (config.allowed_fields) {
            var queryFields = luceneParser(lucQuery);
            var failures = [];

            for (var key in queryFields) {
                if (config.allowed_fields.indexOf(key) === -1) {
                    failures.push(key);
                }
            }
            if (failures.length >= 1) {
                res.status(500).json({error: 'you cannot query on these terms: ' + failures.join('')});
                searchCount.tokenAndStatusCodeCount(req, res, undefined);
                return;
            }
        }

        if (lucQuery && lucQuery.length > 0) {

            config.query = {
                query_string: {
                    default_field: "",
                    query: lucQuery
                }
            };
        }
        performSearch({index: index, ignoreUnavailable: true}, req, res, config)
    }

    function luceneParser(str) {
        var words = str.split(' ');

        return words.reduce(function(prev, val) {
            var test = val.match(/:/);
            if (test) {
                prev[val.slice(0, test.index)] = true
            }

            return prev;
        }, {});
    }

    function geoSearch(req, res, geo_field) {
        var query = req.query;
        var isGeoSort = false;
        var queryResults = {};

        if (query.geo_sort_order || query.geo_sort_unit || query.geo_sort_point) isGeoSort = true;
        var geoSortOrder = query.geo_sort_order || 'asc';
        var geoSortUnit = query.geo_sort_unit || 'm';
        var geoSortPoint;

        function createGeoSortQuery(location){
            var sortedSearch = {"_geo_distance": {}};
            sortedSearch._geo_distance[geo_field] = {
                "lat": location[0],
                "lon": location[1]
            };
            sortedSearch._geo_distance.order = geoSortOrder;
            sortedSearch._geo_distance.unit = geoSortUnit;
            return sortedSearch;
        }

        if (query.geo_box_top_left || query.geo_point || query.geo_distance || query.geo_sort_point) {
            if (query.geo_box_top_left && query.geo_point) {
                error(500, "geo_box and geo_distance queries can not be combined.");
            }

            if ((query.geo_point && !query.geo_distance) || (!query.geo_point && query.geo_distance)) {
                error(500, "Both geo_point and geo_distance must be provided for a geo_point query.");
            }

            if (query.geo_sort_point) {
                 geoSortPoint = geo_point(query.geo_sort_point);
                if (geoSortPoint.length != 2) {
                    error(500, "Invalid geo_sort_point");
                }
            }

            // Handle an Geo Bounding Box query
            if (query.geo_box_top_left) {
                var top_left = geo_point(query.geo_box_top_left);
                if (top_left.length != 2) {
                    error(500, "Invalid geo_box_top_left");
                }

                var bottom_right = geo_point(query.geo_box_bottom_right);
                if (bottom_right.length != 2) {
                    error(500, "Invalid geo_box_bottom_right");
                }
                // if geo sort options are sent without a sort point, send an error message
                if (isGeoSort && !query.geo_sort_point) {
                    error(500, "bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided");
                }

                var search = {
                    "geo_bounding_box": {}
                };

                search.geo_bounding_box[geo_field] = {
                    "top_left": {
                        "lat": top_left[0],
                        "lon": top_left[1]
                    },
                    "bottom_right": {
                        "lat": bottom_right[0],
                        "lon": bottom_right[1]
                    }
                };

                queryResults.query = search;

                if (isGeoSort) {
                    queryResults.sort = createGeoSortQuery(geoSortPoint);
                }

                return queryResults;
            }

            // Handle a Geo Distance from point query
            if (query.geo_distance) {
                if (!valid_geo_distance(query.geo_distance)) {
                    error(500, "geo_distance must be in units of 'mi', 'yd', 'ft', 'km' or 'm'");
                }

                var location = geo_point(query.geo_point);
                if (location.length != 2) {
                    error(500, "Invalid geo_point");
                }
                // if both are available then add this first query
                if (location) {
                    var search = {
                        "geo_distance": {
                            "distance": query.geo_distance
                        }
                    };

                    search.geo_distance[geo_field] = {
                        "lat": location[0],
                        "lon": location[1]
                    };

                    queryResults.query = search;
                }

                var locationPoints = geoSortPoint || location;
                queryResults.sort = createGeoSortQuery(locationPoints);
                return queryResults;
            }
        }

        return false;
    }

    function valid_geo_distance(distance) {
        var matches = distance.match(/(\d+)(.*)$/);

        if (!matches) return false;

        var number = matches[1];
        if (!number) return false;

        var unit = matches[2];

        if (!(unit === 'mi' || unit === 'yd' || unit === 'ft' || unit === 'km' || unit === 'm')) {
            return false;
        }

        return true;
    }

    function geo_point(point) {
        var pieces = point.split(',');
        if (pieces.length == 2) {
            if (pieces[0] > 90 || pieces[0] < -90) {
                return [];
            }

            if (pieces[1] > 180 || pieces[1] < -180) {
                return [];
            }
        }

        return pieces;
    }

    /*
     * Generates a list of indexes to search based off the API history parameters.
     */
    function indexHistory(days, start, history_prefix) {
        var result = "";
        var prefix = history_prefix.charAt(history_prefix.length - 1) === '-' ? history_prefix : history_prefix + '-';

        for (var i = start; i < (start + days); i++) {
            var date = new Date();
            date.setDate(date.getDate() - i);
            var dateStr = date.toISOString().slice(0, 10).replace(/-/gi, '.');
            // example dateStr => logscope-2016.11.11*

            if (result) {
                result += ',' + prefix + dateStr + '*';
            }
            else {
                result = prefix + dateStr + '*';
            }
        }

        return result;
    }

    function validateDateRange(res, date_start, date_end) {
        var message = "";

        if (date_start) {
            date_start = Date.parse(date_start);
            if (Number.isNaN(date_start)) {
                message = "date_start is not a valid ISO 8601 date";
            }
        }

        if (date_end) {
            date_end = Date.parse(date_end);
            if (Number.isNaN(date_end)) {
                message = "date_end is not a valid ISO 8601 date";
            }
        }

        if (date_start && date_end) {
            if (date_start > date_end) {
                message = "date_end is before date_start";
            }
        }
        else if (!message) {
            if (date_end && !date_start) {
                message = "date_end provided without a corresponding date_start";
            }
        }

        if (message) {
            error(500, message);
        }
        else {
            return true;
        }
    }

    function prepareDateRange(date_start, date_end) {
        var query = {
            "range": {}
        };

        query.range[date_field] = {};

        if (date_start && date_end) {
            query.range[date_field].gte = date_start;
            query.range[date_field].lte = date_end;

            return query;
        }
        else if (date_start) {
            query.range[date_field].gte = date_start;

            return query;
        }

        return null;
    }


    function __test_context(config, d_field) {
        appConfig = config;
        date_field = d_field;

        return {
            performSearch: performSearch,
            luceneWithHistoryQuery: luceneWithHistoryQuery,
            luceneQuery: luceneQuery,
            luceneParser: luceneParser,
            geoSearch: geoSearch,
            valid_geo_distance: valid_geo_distance,
            geo_point: geo_point,
            indexHistory: indexHistory,
            validateDateRange: validateDateRange,
            prepareDateRange: prepareDateRange,
            properQuery: properQuery
        }
    }

    return {
        luceneQuery: luceneQuery,
        luceneWithHistoryQuery: luceneWithHistoryQuery,
        performSearch: performSearch,
        __test_context: __test_context
    }
};
