'use strict';

const _ = require('lodash');


module.exports = (_appConfig, _dateField) => {
    let appConfig = _appConfig;
    let dateField = _dateField;
    const logger = appConfig.context.foundation.makeLogger({ module: 'teraserver_search' });
    const searchCount = require('./search_counter')(appConfig.context);

    /*
     TODO: This search functionality is fairly generic but assumes some field names
     date
     type
     */

    function error(code, message) {
        // eslint-disable-next-line
        throw {
            code,
            error: message
        };
    }

    function validate(res, data, type, errField) {
        // eslint-disable-next-line
        if (typeof data !== type) {
            error(500, `the ${errField} parameter must be a ${type}, was given: ${data}`);
        }
        return true;
    }

    function performSearch(context, req, res, config) {
        try {
            const {
                size: size = 100,
                date_start: dateStart,
                date_end: dateEnd,
                start,
                type,
                sort,
                fields
            } = req.query;

            if (size) {
                if (typeof size === 'object') {
                    error(500, `size parameter must be a number, was given ${JSON.stringify(size)}`);
                }
                if (isNaN(Number.parseInt(size, 10))) {
                    error(500, `size parameter must be a valid number, was given ${size}`);
                }
            }

            let maxQuerySize = config.max_query_size;
            if (!maxQuerySize) maxQuerySize = 100000;

            if (size > maxQuerySize) {
                error(500, `Request size too large. Must be less than ${maxQuerySize}.`);
            }

            context.body = {
                query: {
                    bool: {
                        must: []
                    }
                }
            };

            const boolClause = context.body.query.bool.must;

            // Setup the default query context
            if (config.query) {
                boolClause.push(config.query);
            }

            if (config.date_range) {
                if (!validateDateRange(res, dateStart, dateEnd)) {
                    return Promise.resolve(false);
                }
                const dateContext = prepareDateRange(dateStart, dateEnd);
                if (dateContext) {
                    boolClause.push(dateContext);
                }
            }

            context.size = size;

            if (start) {
                if (isNaN(start)) {
                    error(500, `the start parameter must be a number, was given: ${start}`);
                } else {
                    context.from = start;
                }
            }

            // Parameter to retrieve a particular type of record
            if (type) {
                if (!validate(res, type, 'string', 'type')) return Promise.resolve(false);

                boolClause.push({
                    term: { type }
                });
            }

            // See if we should include a default sort
            if (config.sort_default) {
                context.sort = config.sort_default;
            }

            if (config.sort_enabled && sort) {
                // split the value and verify
                if (!validate(res, sort, 'string', 'sort')) return Promise.resolve(false);

                const pieces = sort.split(':');
                if (config.sort_dates_only && pieces[0].toLowerCase() !== dateField) {
                    error(500, `Invalid sort parameter. Sorting currently available for the '${dateField}' field only.`);
                }

                if (pieces.length !== 2 || (pieces[1].toLowerCase() !== 'asc' && pieces[1].toLowerCase() !== 'desc')) {
                    error(500, 'Invalid sort parameter. Must be field_name:asc or field_name:desc.');
                }

                context.sort = sort;
            }

            const client = config.es_client;

            // Geospatial support, we want this after sort so we can determine default geo sort
            if (config.geo_field) {
                const geoSearchQueryData = geoSearch(req, res, config.geo_field, context.sort);
                if (geoSearchQueryData === 500) {
                    // An error has already been sent so just return.
                    return Promise.resolve(false);
                }

                if (geoSearchQueryData) {
                    if (geoSearchQueryData.sort) context.body.sort = [geoSearchQueryData.sort];
                    boolClause.push(geoSearchQueryData.query);
                }
            }

            if (fields || config.allowed_fields) {
                if (fields && !validate(res, fields, 'string', 'fields')) return Promise.resolve(false);
                let finalFields;

                if (config.allowed_fields) {
                    finalFields = config.allowed_fields;
                }

                if (fields) {
                    const fieldsArray = fields.split(',');
                    finalFields = _.filter(fieldsArray, (field) => {
                        if (config.allowed_fields) {
                            if (config.allowed_fields.indexOf(field.trim()) !== -1) {
                                return true;
                            }

                            return false;
                        }

                        return true;
                    });

                    if (finalFields.length === 0) {
                        error(500, 'the fields parameter does not contain any valid fields');
                    }
                }

                context._sourceInclude = finalFields;
            }

            const searchResult = client.search(context);
            const startTime = Date.now();
            return searchResult.then((response) => {
                if (response && response.error) {
                    logger.error(`Search response error ${response.error}`);
                    res.status(500).json({ error: 'Error during query execution.' });
                    return;
                }
                if (response.hits) {
                    let results;
                    let returningNum = response.hits.total;
                    if (config.preserve_index_name) {
                        results = response.hits.hits.map((data) => {
                            const doc = data._source;
                            doc._index = data._index;
                            return doc;
                        });
                    } else {
                        results = response.hits.hits.map(data => data._source);
                    }

                    let message = `${response.hits.total} results found.`;
                    if (response.hits.total > context.size) {
                        returningNum = context.size;
                        message += ` Returning ${returningNum}.`;
                    }

                    if (!config.sort_enabled && req.query.sort) {
                        message += ' No sorting available.';
                    }

                    if (config.post_process && typeof config.post_process === 'function') {
                        results = config.post_process(results);
                    }

                    const finalResponse = {
                        info: message,
                        total: response.hits.total,
                        returning: returningNum,
                        results
                    };

                    if (req.query.pretty === 'true') {
                        res
                            .set('Content-type', 'application/json; charset=utf-8')
                            .send(JSON.stringify(finalResponse, null, 2));
                    } else {
                        res.json(finalResponse);
                    }
                } else {
                    res.status(500).json({ error: 'No results returned from query.' });
                }
            })
                .catch((err) => {
                    logger.error(`Search error ${err}`);
                    res.status(500).json({ error: 'Error during query execution.' });
                })
                .finally(() => {
                    const end = Date.now();
                    return searchCount.tokenAndStatusCodeCount(req, res, end - startTime);
                });
        } catch (err) {
            if (err.code && err.error) {
                res.status(err.code).json({ error: err.error });
            } else {
                res.status(500).json({ error: 'Unknown error' });
            }
            return searchCount.tokenAndStatusCodeCount(req, res);
        }
    }

    function luceneWithHistoryQuery(req, res, indexes, config) {
        // The user can restrict the query to just a subset of indices.
        // history is taken as "days back from current" or if history_start is
        // provided "days back from history_start.
        let newIndexes = indexes;
        // TODO: this only works with daily indices
        if (req.query && req.query.history) {
            let start = 0;
            if (req.query.history_start) start = +req.query.history_start;

            const history = +req.query.history;
            if (Number.isNaN(history) || Number.isNaN(start)) {
                res.status(500).json({ error: 'History specification must be numeric.' });
                searchCount.tokenAndStatusCodeCount(req, res);
                return;
            }

            if (history < 0 || start < 0) {
                res.status(500).json({ error: 'History specification must be a positive number.' });
                searchCount.tokenAndStatusCodeCount(req, res);
                return;
            }

            if ((history + start) > 90) {
                res.status(500).json({ error: 'History is not available beyond 90 days.' });
                searchCount.tokenAndStatusCodeCount(req, res);
                return;
            }

            newIndexes = indexHistory(history, start, config.history_prefix);
        }

        luceneQuery(req, res, newIndexes, config);
    }

    function properQuery(lucQuery, re) {
        const parts = lucQuery.split(' ');
        return _.every(parts, (str) => {
            if (str.match(re)) {
                // checks for a colon in-between zero and multiple characters and one or more colons
                // eslint-disable-next-line
                if (str.match(/\:(?=.{0,40}\:+)/gi)) {
                    return true;
                }
                return false;
            }

            // not a potential problem, so return true
            return true;
        });
    }

    function luceneQuery(req, res, index, config) {
        if (!req.query || !req.query.q) {
            if (config.require_query !== false) {
                res.status(500).json({ error: 'Search query must be specified in the query parameter q.' });
                searchCount.tokenAndStatusCodeCount(req, res);
                return;
            }
        }

        if (config.require_query === true && req.query.q) {
            if (!validate(res, req.query.q, 'string', 'query')) return;
        }
        // if require query is false, need to set to empty string to not break code
        const lucQuery = req.query.q ? req.query.q : '';

        // Verify the query string doesn't contain any forms that we need to block
        const re = RegExp('[^\\s]*.*:[\\s]*[\\*\\?](.*)');
        if (re.test(lucQuery)) {
            if (!properQuery(lucQuery, re)) {
                res.status(500).json({ error: "Wild card queries of the form 'fieldname:*value' or 'fieldname:?value' can not be evaluated. Please refer to the documentation on 'fieldname.right'." });
                searchCount.tokenAndStatusCodeCount(req, res);
                return;
            }
        }

        if (config.allowed_fields) {
            const queryFields = luceneParser(lucQuery);
            const failures = [];

            Object.keys(queryFields).forEach((key) => {
                if (config.allowed_fields.indexOf(key) === -1) {
                    failures.push(key);
                }
            });

            if (failures.length >= 1) {
                res.status(500).json({ error: `you cannot query on these terms: ${failures.join('')}` });
                searchCount.tokenAndStatusCodeCount(req, res);
                return;
            }
        }

        if (lucQuery && lucQuery.length > 0) {
            config.query = {
                query_string: {
                    default_field: '',
                    query: lucQuery
                }
            };
        }
        performSearch({ index, ignoreUnavailable: true }, req, res, config);
    }

    function luceneParser(str) {
        const words = str.split(' ');

        return words.reduce((prev, val) => {
            const test = val.match(/:/);
            if (test) {
                prev[val.slice(0, test.index)] = true;
            }

            return prev;
        }, {});
    }

    function geoSearch(req, res, geoField, hasSortDefined) {
        const { query } = req;
        let isGeoSort = false;
        const queryResults = {};
        // check for key existence to see if they are user defined
        if (query.geo_sort_order || query.geo_sort_unit || query.geo_sort_point) isGeoSort = true;

        const {
            geo_box_top_left: geoBoxTopLeft,
            geo_point: geoPoint,
            geo_distance: geoDistance,
            geo_sort_point: geoSortPoint,
            geo_sort_order: geoSortOrder = 'asc',
            geo_sort_unit: geoSortUnit = 'm'
        } = query;

        function createGeoSortQuery(location) {
            const sortedSearch = { _geo_distance: {} };
            sortedSearch._geo_distance[geoField] = {
                lat: location[0],
                lon: location[1]
            };
            sortedSearch._geo_distance.order = geoSortOrder;
            sortedSearch._geo_distance.unit = geoSortUnit;
            return sortedSearch;
        }

        let parsedGeoSortPoint;

        if (geoBoxTopLeft || geoPoint || geoDistance || geoSortPoint) {
            if (geoBoxTopLeft && geoPoint) {
                error(500, 'geo_box and geo_distance queries can not be combined.');
            }

            if ((geoPoint && !geoDistance) || (!geoPoint && geoDistance)) {
                error(500, 'Both geo_point and geo_distance must be provided for a geo_point query.');
            }

            if (geoSortPoint) {
                parsedGeoSortPoint = createGeoPoint(geoSortPoint);
                if (parsedGeoSortPoint.length !== 2) {
                    error(500, 'Invalid geo_sort_point');
                }
            }

            // Handle an Geo Bounding Box query
            if (geoBoxTopLeft) {
                const topLeft = createGeoPoint(geoBoxTopLeft);
                if (topLeft.length !== 2) {
                    error(500, 'Invalid geo_box_top_left');
                }

                const bottomRight = createGeoPoint(query.geo_box_bottom_right);
                if (bottomRight.length !== 2) {
                    error(500, 'Invalid geo_box_bottom_right');
                }
                // if geo sort options are sent without a sort point, send an error message
                if (isGeoSort && !geoSortPoint) {
                    error(500, 'bounding box search requires geo_sort_point to be set if any other geo_sort_* parameter is provided');
                }

                const search = {
                    geo_bounding_box: {}
                };

                search.geo_bounding_box[geoField] = {
                    top_left: {
                        lat: topLeft[0],
                        lon: topLeft[1]
                    },
                    bottom_right: {
                        lat: bottomRight[0],
                        lon: bottomRight[1]
                    }
                };

                queryResults.query = search;

                if (isGeoSort) {
                    queryResults.sort = createGeoSortQuery(parsedGeoSortPoint);
                }

                return queryResults;
            }

            // Handle a Geo Distance from point query
            if (geoDistance) {
                if (!validGeoDistance(geoDistance)) {
                    error(500, "geo_distance must be in units of 'mi', 'yd', 'ft', 'km' or 'm'");
                }

                const location = createGeoPoint(geoPoint);
                if (location.length !== 2) {
                    error(500, 'Invalid geo_point');
                }
                // if both are available then add this first query
                const search = {
                    geo_distance: {
                        distance: geoDistance
                    }
                };

                queryResults.query = search;

                // if user defined sort, dont add geo sort unless explicitly defined
                if (!hasSortDefined || (hasSortDefined && isGeoSort)) {
                    const locationPoints = parsedGeoSortPoint || location;
                    queryResults.sort = createGeoSortQuery(locationPoints);
                }

                return queryResults;
            }
        }

        return false;
    }

    function validGeoDistance(distance) {
        const matches = distance.match(/(\d+)(.*)$/);

        if (!matches) return false;

        const number = matches[1];
        if (!number) return false;

        const unit = matches[2];

        if (!(unit === 'mi' || unit === 'yd' || unit === 'ft' || unit === 'km' || unit === 'm')) {
            return false;
        }

        return true;
    }

    function createGeoPoint(point) {
        const pieces = point.split(',');
        if (pieces.length === 2) {
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
    function indexHistory(days, start, _prefix) {
        let result = '';
        const prefix = _prefix.charAt(_prefix.length - 1) === '-' ? _prefix : `${_prefix}-`;

        for (let i = start; i < (start + days); i += 1) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().slice(0, 10).replace(/-/gi, '.');
            // example dateStr => logscope-2016.11.11*

            if (result) {
                result += `,${prefix}${dateStr}*`;
            } else {
                result = `${prefix + dateStr}*`;
            }
        }

        return result;
    }

    function validateDateRange(res, dateStart, dateEnd) {
        let message = '';
        let parsedStart;
        let parsedEnd;

        if (dateStart) {
            parsedStart = Date.parse(dateStart);
            if (Number.isNaN(parsedStart)) {
                message = 'date_start is not a valid ISO 8601 date';
            }
        }

        if (dateEnd) {
            parsedEnd = Date.parse(dateEnd);
            if (Number.isNaN(parsedEnd)) {
                message = 'date_end is not a valid ISO 8601 date';
            }
        }

        if (dateStart && dateEnd) {
            if (parsedStart > parsedEnd) {
                message = 'date_end is before date_start';
            }
        } else if (!message) {
            if (dateEnd && !dateStart) {
                message = 'date_end provided without a corresponding date_start';
            }
        }

        if (message) {
            error(500, message);
            return false;
        }
        return true;
    }

    function prepareDateRange(dateStart, dateEnd) {
        const query = {
            range: {}
        };

        query.range[dateField] = {};

        if (dateStart && dateEnd) {
            query.range[dateField].gte = dateStart;
            query.range[dateField].lte = dateEnd;

            return query;
        } else if (dateStart) {
            query.range[dateField].gte = dateStart;

            return query;
        }

        return null;
    }


    function testContext(config, testDateField) {
        appConfig = config;
        dateField = testDateField;

        return {
            performSearch,
            luceneWithHistoryQuery,
            luceneQuery,
            luceneParser,
            geoSearch,
            validGeoDistance,
            createGeoPoint,
            indexHistory,
            validateDateRange,
            prepareDateRange,
            properQuery
        };
    }

    return {
        luceneQuery,
        luceneWithHistoryQuery,
        performSearch,
        __test_context: testContext
    };
};
