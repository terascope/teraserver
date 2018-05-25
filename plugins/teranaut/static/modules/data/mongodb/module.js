'use strict';

angular.module('teranaut.data.mongodb', [])

    .provider('mongodbData', function() {
        this.baseUrl = '/api/v1';
        this.$get = ['$http', function($http) {
            var baseUrl = this.baseUrl;
            return {
                getBaseUrl: function() {
                    return baseUrl;
                },

                getData: function(collection, config) {
                    return this.request(this.prepareUrl(collection, config));
                },

                prepareUrl: function(collection, config) {

                    var url = baseUrl + '/' + collection;

                    if (config) {
                        url += '?';
                        if (config.criteria) {
                            url += '&conditions=' + config.criteria;
                        }

                        if (config.sort) {
                            url += '&sort=' + config.sort;
                        }

                        if (config.limit) {
                            url += '&limit=' + config.limit;
                        }

                        if (config.skip) {
                            url += '&skip=' + config.skip;
                        }

                        if (config.count) {
                            url += '&count=true';
                        }

                        if (config.select) {
                            url += '&select=' + config.select;
                        }

                        if (config.distinct) {
                            url += '&distinct=' + config.distinct;
                        }
                    }

                    return url;
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
                }
            };
        }];

        this.setBaseUrl = function(baseUrl) {
            this.baseUrl = baseUrl;
        };
    })

    .service('mongodbSearch', ['mongodbData', function(mongodbData) {
        function startsWith(str, prefix) {
          if (str.length < prefix.length) return false;
          for (var i = prefix.length - 1; (i >= 0) && (str[i] === prefix[i]); --i) continue;
          return i < 0;
        }

        function apply_modifiers(criteria, context) {
            function wildcard_query(fields, value) {
                fields = fields.split('$');

                if (! criteria.hasOwnProperty('$or')) {
                    criteria['$or'] = [];
                }

                fields.forEach(function(field) {
                    var regex = {};
                    regex[field] = { $regex: value, $options: 'i' };
                    criteria['$or'].push(regex);
                })
                //angular.forEach(fields, function(value, key) {
                //  this.push(key + ': ' + value);
                //}, log);
            }

            angular.forEach(context, function(value, key) {
                if (startsWith(key, '_wildcard$')) {
                    var fields = key.substring('_wildcard$'.length)
                    wildcard_query(fields, value)
                }
            })
        }

        return {
            activeUrl: function(context) {
                var config = this.prepare(context);

                return mongodbData.prepareUrl(context.searchConfig.collection, config);
            },

            prepare: function(context) {
                var criteria = {};

// TODO: auto handling of date restriction

                var fields = context.searchConfig.fields;

                for (var i = 0; i < fields.length; i++) {
                    var field = fields[i];

                    if (context.hasOwnProperty(field.name) && context[field.name] != "") {
                        criteria[field.name] = context[field.name]
                    }
                }

                // This looks for special fields that can do wildcard searches.
                apply_modifiers(criteria, context);

                var config = {
                    criteria: JSON.stringify(criteria),
                    limit: context.uiPageSize,
                    skip: ((context.uiResultPage - 1) * context.uiPageSize)
                }

                if (context.uiSortField) config.sort = context.uiSortField;

                return config;
            },

            search: function(context, done) {
                var config = this.prepare(context);

                var searchConfig = context.searchConfig;
                mongodbData.getData(searchConfig.collection, config).then(function(records) {
                    if (records) {
                        // A second query is required to the get the count for paging.
                        // This is not ideal, especially since counting in mongo can be slow.
                        config.count = true;
                        delete config.sort;
                        // TODO: confirm this is the correct thing to be doing here
                        config.limit = null;
                        config.skip = null;
                        mongodbData.getData(searchConfig.collection, config).then(function(count) {
                            return done(count, records);
                        });
                        return;
                    }

                    done(1, []); // No results
                });
            }
        }
    }]);