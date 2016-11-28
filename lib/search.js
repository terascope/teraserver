'use strict';

var _ = require('lodash');

module.exports = function(appConfig, date_field) {
    var logger = appConfig.context.foundation.makeLogger('search_module', 'search_module', {module: 'teraserver_search'});

    /*
     TODO: This search functionality is fairly generic but assumes some field names
     date
     type
     */
    function performSearch(context, req, res, config) {
        if (req.query.size > 100000) {
            res.status(500).json({error: "Request size too large. Must be less than 100000."});
            return;
        }

        var bool_clause;

        // Setup the default query context
        if (config.query) {
            // If the query we're running can be run as a filter we do so.
            // Not every query works as a filter.
            if (config.nofilter) {
                context.body = {
                    'query': {
                        'bool': {
                            'must': [
                                config.query
                            ]
                        }
                    }
                };

                bool_clause = context.body.query.bool;
            }
            else {
                //TODO verify the whole filtered, filter thing works
                context.body = {
                    'query': {
                        'bool': {
                            'must': [
                                config.query
                            ]
                        }
                    }
                };

                bool_clause = context.body.query.bool;
            }
        }

        if (config.date_range) {
            if (!validateDateRange(res, req.query.date_start, req.query.date_end)) {
                return;
            }

            var dateContext = prepareDateRange(req.query.date_start, req.query.date_end);
            if (dateContext) {
                bool_clause.must.push(dateContext);
            }
        }

        // Geospatial support
        if (config.geo_field) {
            var geo_search = geoSearch(req, res, config.geo_field);
            if (geo_search) {
                bool_clause.must.push(geo_search);
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
            context.from = req.query.start;
        }

        // Parameter to retrieve a particular type of record
        // TODO: validate incoming type
        if (req.query.type) {
            bool_clause.must.push({
                'term': {
                    'type': req.query.type
                }
            });
        }

        // See if we should include a default sort
        if (config.sort_default) {
            context.sort = config.sort_default;
        }

        if (config.sort_enabled && req.query.sort) {
            // split the value and verify
            var pieces = req.query.sort.split(':');
            if (config.sort_dates_only && pieces[0].toLowerCase() !== date_field) {
                res.status(500).json({error: "Invalid sort parameter. Sorting currently available for the '" + date_field + "' field only."});
                return;
            }

            if (pieces.length != 2 || (pieces[1].toLowerCase() != 'asc' && pieces[1].toLowerCase() != 'desc')) {
                res.status(500).json({error: "Invalid sort parameter. Must be field_name:asc or field_name:desc."});
                return;
            }

            context.sort = req.query.sort;
        }
        var client = config.es_client;

        if (req.query.fields || config.allowed_fields) {
            var finalFields;

            if (config.allowed_fields) {
                finalFields = config.allowed_fields;
            }

            if (req.query.fields) {
                var fields = _.words(req.query.fields);
                finalFields = _.filter(fields, function(field) {
                    if (config.allowed_fields) {
                        if (config.allowed_fields.indexOf(field) !== -1) {
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
            }

            context._sourceInclude = finalFields;
        }

        client.search(context, function(error, response) {
            if (error || (response && response.error)) {
                if (error) {
                    logger.error("Search error " + error);
                }
                else {
                    logger.error("Search response error " + response.error);
                }

                res.status(500).json({error: 'Error during query execution.'});
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

                var final_response = {
                    info: message,
                    total: response.hits.total,
                    returning: +context.size,
                    results: results
                };

                if (req.query.pretty) {
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
            }
        });
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
                return;
            }

            if (history < 0 || start < 0) {
                res.status(500).json({error: "History specification must be a positive number."});
                return;
            }

            if ((history + start) > 90) {
                res.status(500).json({error: "History is not available beyond 90 days."});
                return;
            }

            indexes = indexHistory(history, start, config.history_prefix);
        }

        luceneQuery(req, res, indexes, config);
    }

    function luceneQuery(req, res, index, config) {
        if (!req.query && !req.query.q) {
            res.status(500).json({error: "Search query must be specified in the query parameter q."});
            return;
        }

        var lucQuery = req.query.q;

        // Verify the query string doesn't contain any forms that we need to block
        var re = RegExp('[^\\s]*.*:[\\s]*[\\*\\?](.*)');
        if (re.test(lucQuery)) {
            res.status(500).json({error: "Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'."});
            return;
        }

        config.nofilter = true;

        if (config.allowed_fields) {
            var queryFields = luceneParser(lucQuery);
            var failures = [];

            for (var key in queryFields) {
                if (config.allowed_fields.indexOf(key) === -1) {
                    failures.push(key);
                }
            }

            if (failures.length >= 1) {
                res.status(400).json({error: 'you cannot query on these terms: ' + failures.join('')});
                return
            }
        }

        config.query = {
            query_string: {
                default_field: "",
                query: lucQuery
            }
        };

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

    function geoSearch(req, res, geo_field) {
        var query = req.query;

        if (query.geo_box_top_left || query.geo_point) {
            if (query.geo_box_top_left && query.geo_point) {
                res.status(500).json({error: "geo_box and geo_distance queries can not be combined."});
                return;
            }

            // Handle an Geo Bounding Box query
            if (query.geo_box_top_left) {
                var top_left = geo_point(query.geo_box_top_left);
                if (top_left.length != 2) {
                    res.status(500).json({error: "Invalid geo_box_top_left"});
                    return;
                }

                var bottom_right = geo_point(query.geo_box_bottom_right);
                if (bottom_right.length != 2) {
                    res.status(500).json({error: "Invalid geo_box_bottom_right"});
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
                    res.status(500).json({error: "geo_distance must be in units of 'mi', 'yd', 'ft', 'km' or 'm'"});
                    return;
                }

                var location = geo_point(query.geo_point);
                if (location.length != 2) {
                    res.status(500).json({error: "Invalid geo_point"});
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
            res.status(500).json({error: message});
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

    return {
        luceneQuery: luceneQuery,
        luceneWithHistoryQuery: luceneWithHistoryQuery,
        performSearch: performSearch
    }
};