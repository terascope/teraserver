'use strict';

var _ = require('lodash');

module.exports = function(appConfig, date_field) {
    var appConfig = appConfig;
    var date_field = date_field;
    var logger = appConfig.context.foundation.makeLogger({module: 'teraserver_search'});

    /*
     TODO: This search functionality is fairly generic but assumes some field names
     date
     type
     */

    function parseError(err) {
        var errMsg;
        var root = _.get(err, 'root_cause[0]');
        if (root && root.type && root.reason) {
            errMsg = `${root.type}: ${root.reason}`
        }
        else {
            if (err.message) {
                errMsg = err.message
            }
            else {
                errMsg = err
            }
        }

        return errMsg
    }

    function sendError(res, statusCode, query, debug, error, message, isPretty) {
        var errResponse = {};
        res.set("Content-type", "application/json; charset=utf-8");
        if (message) {
            errResponse.message = message
        }

        if (debug) {
            // disabling this for security concerns
            // errResponse.criteria = query;

            if (error) {
                errResponse.error = parseError(error)
            }
        }

        if (isPretty) {
            var formattedResponse = JSON.stringify(errResponse, null, 2);
            res.status(statusCode).send(formattedResponse);
        }
        else {
            res.status(statusCode).json(errResponse);
        }
    }

    function validate(res, data, type, errField) {
        if (typeof data !== type) {
            res.status(500).json({error: "the " + errField + " parameter must be a " + type + ", was given: " + data});
            return false;
        }
        return true;
    }

    function performSearch(context, req, res, config) {
        var debug = config.debug ? config.debug : true;
        var isPretty = req.query.pretty;
        if (req.query.size) {
            var size = req.query.size;
            if (typeof size === "object") {
                sendError(res, 500, req.query, debug, `size parameter must be a number, was given ${JSON.stringify(size)}`, isPretty);
                return;
            }

            if (isNaN(Number.parseInt(size))) {
                sendError(res, 500, req.query, debug, `size parameter must be a valid number, was given ${size}`, isPretty);
                return;
            }
        }


        var max_query_size = config.max_query_size;
        if (! max_query_size) max_query_size = 100000;

        if (req.query.size && req.query.size > 100000) {
            sendError(res, 500, req.query, debug, `Request size too large. Must be less than ${max_query_size}.`, isPretty);
            return;
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
            if (!validateDateRange(res, req.query.date_start, req.query.date_end, isPretty)) {
                return;
            }
            var dateContext = prepareDateRange(req.query.date_start, req.query.date_end);
            if (dateContext) {
                bool_clause.push(dateContext);
            }
        }

        // Geospatial support
        if (config.geo_field) {
            var geo_search = geoSearch(req, res, config.geo_field, config);
            if (geo_search) {
                bool_clause.push(geo_search);
            }
            else {
                return;
            }
        }

        context.size = 100;
        if (req.query.size) {
            context.size = req.query.size;
        }

        if (req.query.start) {
            if (isNaN(req.query.start)) {
                sendError(res, 500, req.query, debug, `the start parameter must be a number, was given: ${req.query.start}`, isPretty);
                return;
            }
            else {
                context.from = req.query.start;
            }
        }

        // Parameter to retrieve a particular type of record
        if (req.query.type) {
            //es, data, type, errField
            if (typeof req.query.type !== 'string') {
                sendError(res, 500, req.query, debug, `the type parameter must be a string was given: ${typeof req.query.type}`, isPretty);
                return;
            }
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
            if (typeof req.query.sort !== "string") {
                sendError(res, 500, req.query, debug, `the sort parameter must be a string was given: ${typeof req.query.sort}`, isPretty);
                return;
            }

            var pieces = req.query.sort.split(':');
            if (config.sort_dates_only && pieces[0].toLowerCase() !== date_field) {
                sendError(res, 500, req.query, debug, `Invalid sort parameter. Sorting currently available for the "${date_field}" field only`);
                return;
            }

            if (pieces.length != 2 || (pieces[1].toLowerCase() != 'asc' && pieces[1].toLowerCase() != 'desc')) {
                sendError(res, 500, req.query, debug, `Invalid sort parameter. Must be field_name:asc or field_name:desc`, isPretty);
                return;
            }

            context.sort = req.query.sort;
        }
        var client = config.es_client;

        if (req.query.fields || config.allowed_fields) {

            if (req.query.fields && (typeof req.query.fields !== "string")) {
                sendError(res, 500, req.query, debug, `the fields parameter must be a string was given: ${typeof req.query.fields}`, isPretty);
                return;
            }
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
                    sendError(res, 500, req.query, debug, `the fields parameter does not contain any valid fields`, isPretty);
                    return;
                }

            }

            context._sourceInclude = finalFields;
        }

        client.search(context, function(_error, response) {
            if (_error || (response && response.error)) {
                var errMsg = response.error ? response.error : _error.stack;

                if (_error) {
                    logger.error(`Search error: ${errMsg}`);
                }
                else {
                    logger.error(`Search response error: ${errMsg}`);
                }

                sendError(res, 500, JSON.stringify(context), debug, errMsg, 'Error during query execution.', isPretty);
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
                sendError(res, 500, req.query, debug, `No results returned from query`, isPretty);
            }
        });
    }

    function luceneWithHistoryQuery(req, res, indexes, config) {
        var debug = config.debug ? config.debug : true;
        var isPretty = req.query.pretty;
        // The user can restrict the query to just a subset of indices.
        // history is taken as "days back from current" or if history_start is
        // provided "days back from history_start.
        // TODO: this only works with daily indices
        if (req.query && req.query.history) {
            var start = 0;
            if (req.query.history_start) start = +req.query.history_start;

            var history = +req.query.history;
            if (Number.isNaN(history) || Number.isNaN(start)) {
                sendError(res, 500, req.query, debug, `History specification must be numeric`, isPretty);
                return;
            }

            if (history < 0 || start < 0) {
                sendError(res, 500, req.query, debug, `History specification must be a positive number`, isPretty);
                return;
            }

            if ((history + start) > 90) {
                sendError(res, 500, req.query, debug, `History is not available beyond 90 days`, isPretty);
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
        var debug = config.debug ? config.debug : true;
        var isPretty = req.query.pretty;
        if (!req.query || !req.query.q) {
            if (config.require_query !== false) {
                sendError(res, 500, req.query, debug, `Search query must be specified in the query parameter q`, isPretty);
                return;
            }
        }

        if (config.require_query === true && req.query.q) {
            if (typeof req.query.q !== "string") {
                sendError(res, 500, req.query, debug, `the q parameter must be a string was given: ${typeof req.query.q}`, isPretty);
                return;
            }
        }
        //if require query is false, need to set to empty string to not break code
        var lucQuery = req.query.q ? req.query.q : '';

        // Verify the query string doesn't contain any forms that we need to block
        var re = RegExp('[^\\s]*.*:[\\s]*[\\*\\?](.*)');
        if (re.test(lucQuery)) {
            if (!properQuery(lucQuery, re)) {
                sendError(res, 500, req.query, debug, `Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'`, isPretty);
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
                sendError(res, 400, req.query, debug, `you cannot query on these terms: ${failures.join('')}`, isPretty);
                return
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

        performSearch({index: index, ignoreUnavailable: true}, req, res, config);
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

    function geoSearch(req, res, geo_field, config) {
        var query = req.query;
        var debug = config.debug ? config.debug : true;
        var isPretty = query.pretty;

        if (query.geo_box_top_left || query.geo_point || query.geo_distance) {
            if (query.geo_box_top_left && query.geo_point) {
                sendError(res, 500, req.query, debug, `geo_box and geo_distance queries can not be combined`, isPretty);
                return;
            }

            if ((query.geo_point && !query.geo_distance) || (!query.geo_point && query.geo_distance)) {
                sendError(res, 500, req.query, debug, `values for geo_point or geo_distance in the query are missing, they must be used in conjunction, please verify your query`, isPretty);
                return;
            }

            if ((query.geo_point && !query.geo_distance) || (!query.geo_point && query.geo_distance)) {
                res.status(500).json({error: "Both geo_point and geo_distance must be provided for a geo_point query."});
                return;
            }

            // Handle an Geo Bounding Box query
            if (query.geo_box_top_left) {
                var top_left = geo_point(query.geo_box_top_left);
                if (top_left.length != 2) {
                    sendError(res, 500, req.query, debug, `Invalid geo_box_top_left`, isPretty);
                    return;
                }

                var bottom_right = geo_point(query.geo_box_bottom_right);
                if (bottom_right.length != 2) {
                    sendError(res, 500, req.query, debug, `Invalid geo_box_bottom_right`, isPretty);
                    return;
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

                return search;
            }

            // Handle a Geo Distance from point query
            if (query.geo_distance) {
                if (!valid_geo_distance(query.geo_distance)) {
                    sendError(res, 500, req.query, debug, `geo_distance must be in units of 'mi', 'yd', 'ft', 'km' or 'm'`, isPretty);
                    return;
                }

                var location = geo_point(query.geo_point);
                if (location.length != 2) {
                    sendError(res, 500, req.query, debug, `Invalid geo_point`, isPretty);
                    return;
                }

                var search = {
                    "geo_distance": {
                        "distance": query.geo_distance
                    }
                };

                search.geo_distance[geo_field] = {
                    "lat": location[0],
                    "lon": location[1]
                };

                return search;
            }
        }

        return {};
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

    function validateDateRange(res, date_start, date_end, isPretty) {
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
            sendError(res, 500, req.query, debug, message, isPretty);
            return false;
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