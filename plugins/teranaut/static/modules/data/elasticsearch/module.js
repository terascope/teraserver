'use strict';

angular.module('teranaut.data.elasticsearch', [])

    .provider('elasticsearchData', function() {
        this.baseUrl = '/api/v1';
        this.$get = ['$http', function($http) {
            var baseUrl = this.baseUrl;
            return {                
                getBaseUrl: function() {                    
                    return baseUrl;
                },
                
                getData: function(endpoint, config) {
                    return this.request(this.prepareUrl(endpoint, config));  
                },

                request: function(url, cache) {                    
                    return $http({
                        method: 'GET',
                        url: url,
                        cache: cache
                    }).then(function(result) {
                        return result.data;
                    }, function(error) {
                        console.log(error);
                        //$rootScope.systemError = "Service unavailable."
                    });
                },

                prepareUrl: function(endpoint, config) {
                    var url = baseUrl + '/' + endpoint;
                    if (config) {
                        url += '?';                    
                        if (config.criteria) {
                            url += '&q=' + config.criteria;
                        }

                        if (config.sort) {
                            url += '&sort=' + config.sort;
                        }
                        
                        if (config.limit) {
                            url += '&size=' + config.limit;
                        }
                        
                        if (config.skip) {
                            url += '&start=' + config.skip;
                        }
                        
                        if (config.type) {
                            url += '&type=' + config.type;
                        }

                        if (config.history) {
                            url += '&history=' + config.history;
                        }

                        if (config.history_start) {
                            url += '&history_start=' + config.history_start;
                        }

                        if (config.date_start) {
                            url += '&date_start=' + config.date_start;
                        }

                        if (config.date_end) {
                            url += '&date_end=' + config.date_end;
                        }
                    }

                    return url;
                }
            };
        }];

        this.setBaseUrl = function(baseUrl) {
            this.baseUrl = baseUrl;
        };
    })

    .service('elasticsearchSearch', ['elasticsearchData', function(elasticsearchData) {
        return {
            
            /*
             * Looks at the state of the context and prepares the search criteria.
             */
            activeUrl: function(context) {             
                var config = this.prepare(context);
                    
                return elasticsearchData.prepareUrl(context.searchConfig.collection, config);
            },

            prepare: function(context) {
                var criteria = context.criteria;
                if (!criteria) criteria = context.searchConfig.defaultCriteria;

                /*if (context.startDate && ! context.endDate) {           
                    criteria += ' AND ' + context.searchConfig.dateField + ':[' + context.startDate.toISOString() + ' TO ' + (new Date()).toISOString() +']';
                }
                else if (context.startDate && context.endDate) {
                    criteria += ' AND ' + context.searchConfig.dateField + ':[' + context.startDate.toISOString() + ' TO ' + context.endDate.toISOString() +']';
                }*/

                function formatRegex(str) {
                    var fields = context.searchConfig.regexSearchFields.map(function(field){return field + '.text'});
                    var fieldList = fields.map(function(val){return val + ':/.*' + str + '.*/'});
                    return fieldList.join(' OR ');
                }

                if (context.searchConfig.regexSearchFields) criteria = formatRegex(criteria);

                var config = {
                    criteria: criteria,
                    limit: context.uiPageSize,
                    skip: ((context.uiResultPage - 1) * context.uiPageSize)
                };

                if (context.startDate) {
                    config.date_start = context.startDate.toISOString();
                }

                if (context.endDate) {
                    config.date_end = context.endDate.toISOString();
                } 

                if (context.uiSortField) {
                    if (context.uiSortField[0] === '-') {
                        config.sort = context.uiSortField.substring(1) + ":desc"
                    }
                    else {
                        config.sort = context.uiSortField + ":asc"
                    }
                }
                
                // If there was no explicit setting for history and date ranges are in effect.
                // use those ranges to setup the history.                                   
                if (context.searchConfig.history > 0 && (context.startDate || context.endDate)) {
                    var oneDay = 24 * 60 * 60 * 1000;
                    var now = new Date();
                 
                    if (context.startDate) {                        
                        if (context.endDate) {
                            var start = Math.ceil(((now.getTime() - context.endDate.getTime()) / (oneDay)));
                            var history = Math.ceil(((context.endDate.getTime() - context.startDate.getTime()) / (oneDay)));

                            if (start <= 0) {
                                start = 0; // Can't search indexes that don't exist yet
                                history = Math.ceil(((now.getTime() - context.startDate.getTime()) / (oneDay)));
                            }
                                                  
                            // If it's a valid range set it in the 
                            if ((history + start) <= context.searchConfig.history) {
                                config.history = history; 
                                config.history_start = start; 
                            }
                            // If just the start is in range. just set a limited range
                            else if (start <= context.searchConfig.history) {
                                config.history = context.searchConfig.history; 
                                config.history_start = start; 
                            }
                            // Otherwise it's an invalid range, so we don't restrict it.
                        
                        }
                        else {
                            var history = Math.ceil(((now.getTime() - context.startDate.getTime()) / (oneDay)));

                            if (history > 0 && history <= context.searchConfig.history) {
                                config.history = history; // include current date and history days
                            }

                            //  Only search the current days index if history comes out negative.
                            if (history <= 0) config.history = 1;
                        }
                    }
                }  

                /*if (context.uiHistory) { 
                    if (! config.history) {
                        config.history = context.uiHistory;
                    }
                    else if ((config.history && (context.uiHistory < config.history)) && (! config.history_start)) {
                        config.history = context.uiHistory;
                    }
                }*/
          

                return config;
            },

            search: function(context, done) {
                var config = this.prepare(context);
                // No criteria so no query will be run.
                if (!config.criteria && !context.searchConfig.allowEmptyQuery) return done(1, []);
                elasticsearchData.getData(context.searchConfig.collection, config).then(function(records) {
                    if (records) {
                        var count, results;
                        if (Array.isArray(records)) {
                            count = records.length;
                            results = records;
                        } else {
                            //This was how it was done previously, keeping it for backwards compatability
                            count = records.info.match(/^\d+/)[0];
                            results = records.results
                        }

                        return done(count, results);
                    }
                    
                    done(1, []); // No results
                }, function(err) {
                    console.log(err);
                });
            }
        }
    }]);

