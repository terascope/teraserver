'use strict';

angular.module('teranaut.search').
    directive('queryFilters', ['$compile', '$templateCache', '$http', function ($compile, $templateCache, $http) {    
        var qe = window.QueryEngine;

        var originalData;

        return {
            restrict: 'E',
            scope: {
                fields: '=',
                data: '=',
                results: '=',
                filters: '=',
                filtering: '='
            },
            link: function(scope, element, attrs) {
                var selector;
                var root = element;   
                var query = {};
                //if (! scope.query) scope.query = {};            

                //scope.results = scope.data;

                scope.operators = {
                    'string': {                        
                        /*'=': 'Contains',
                        '!=': 'Does not contain',*/
                        '=': 'is',
                        'ne': 'is not',
                        'beginsWith': 'begins with',
                        'endsWith': 'ends with'
                    },
                    'number': {
                        '=': 'is',
                        'ne': 'is not',
                        'gt': 'is greater than',
                        'lt': 'is less than',
                        'range': 'is in the range'
                    },
                    'date': {
                        '=': 'is',
                        'ne': 'is not',
                        'gt': 'is after',
                        'lt': 'is before',
                        //'period': 'in the last',
                        //'not_period': 'not in the last',
                        'range': 'is in the range'
                    },
                    'list': {
                        'in': 'list contains',
                        'nin': 'list does not contain'
                    },
                    'boolean': {

                    },
                    'enum': {
                        '=': 'is',
                        'ne': 'is not'
                    }
                }

                var emptyFilter = function() {
                    return {
                        name: '',
                        type: '',
                        value: null,                       
                        operator: ''
                    }
                }

                if (! scope.filters || ($.isArray(scope.filters) && scope.filters.length === 0)) {
                    scope.filters = [ emptyFilter() ];
                }
                else {
                    console.log("Filters must either be null or contain a list of filter specifications.")
                }

                var templateLoader = function() {
                    var templateUrl = '/app/search/filter-view.tpl.html';
                    return($http.get(templateUrl, { cache: $templateCache }));
                }                

                var compileQuery = function() {
                    query = {};
                    for (var i = 0; i < scope.filters.length; i++) {
                        var filter = scope.filters[i];

                        if (filter.value) {       

                            if (filter.preprocess) {
                                filter.value = filter.preprocess(filter.value);    
                            }                 

                            if (filter.operator === '=') {                         
                                /*if (! query.hasOwnProperty(filter.name)) {
                                    // We have an existing value so, we need to switch to combine the query
                                    if (query.hasOwnProperty('$and')) {

                                    }
                                    else {
                                        var existingValue = query[filter.name];
                                        query['$and'] = [{
                                            filter.name: existingValue
                                        },
                                        {
                                            filter.name: filter.preprocess(filter.value);
                                        }];   
                                    }
                                }
                                else {*/
                                 
                                query[filter.name] = filter.value;
                            }
                            else if (filter.operator === 'range') {
                                if (! query.hasOwnProperty(filter.name)) {
                                    query[filter.name] = {};    
                                }
                             
                                if (typeof query[filter.name] != 'object') {
                                    delete query[filter.name];
                                    query[filter.name] = {};               
                                }

                                query[filter.name]['$bte'] = [filter.value, filter.value2];
                            }
                            else {
                                if (filter.operator) {
                                    var operator = '$' + filter.operator;

                                    if (! query.hasOwnProperty(filter.name)) {
                                        query[filter.name] = {};    
                                    }
                                    else {
                                        if (typeof query[filter.name] != 'object') {
                                            delete query[filter.name];
                                            query[filter.name] = {};               
                                        }
                                    }
                                    // TODO will need to see if the existing value is equality or an operator
                                    // combining both isn't going to work

                                    query[filter.name]['$' + filter.operator] = filter.value;
                                }
                            }
                        }                        
                    }
                }

                scope.$watch('data.length', function() {
                    scope.applyFilters();
                });

                scope.$watch('filters.length == 0', function() {                    
                    if (scope.filters.length == 0) {
                        scope.filters.push(emptyFilter());
                    }
                });

                scope.applyFilters = function() {
                    compileQuery();
console.log("Compiled query " + JSON.stringify(query));                        
                    
                    if (! $.isEmptyObject(query)) {                        
                        scope.filtering = true
                        var criteria = new qe.Criteria();
                        scope.results = criteria.testModels(scope.data, { queries: { test: query } }); 
                    }
                    else {      
                        scope.filtering = false;                  
                        scope.results = [];
                    }
                }

                scope.updateFilter = function(filter) {
                    // Once you set a date value this always sets a date value.                        
                    if (filter.type === 'date' && filter.dateValue) filter.value = filter.dateValue;

                    if (filter.type === 'date' && filter.operator === 'range' && filter.dateValue2) {
                        filter.value2 = filter.dateValue2;
                    }   
                                     
                    if (filter.type === 'number') {
                        filter.value = parseInt(filter.value)
                        if (filter.value === NaN) {
                            filter.value = null;
                        }

                        if (filter.value2) {
                            filter.value2 = parseInt(filter.value2)
                            if (filter.value2 === NaN) {
                                filter.value2 = null;
                            }
                        }
                    }

                    scope.applyFilters();
                }


                scope.setFilterType = function(filter) {
                    // Search the list of fields for this criteria.
                    // TODO: using criteria here is probably overkill.
                    var criteria = new qe.Criteria();
                    var matches = criteria.testModels(scope.fields, { queries: { test: { name: filter.name } } }); 
                    if (matches.length == 1) {                        
                        var field = matches[0];
                        if (filter.type !== field.type) {
                            filter.type = field.type;
                            filter.value = null;
                        }

                        filter.operator = '=';
                        if (filter.type == 'list') {
                            filter.operator = 'in';
                        }

                        if (filter.type === 'enum') {
                            if (field.options) {
                                filter.options = field.options;
                            }
                            else {
                                console.log("Enum type requires a list of options");
                            }
                        }

                        if (field.preprocess && (typeof(field.preprocess) == 'function')) {
                            filter.preprocess = field.preprocess;
                        }                        
                    }
                    // This is for the no filters selected case                    
                    else {
                        filter.type = ''
                        if (scope.filters.length == 1) {
                            scope.results = [];
                        }
                    }
                }   
                
                scope.addFilter = function() {
                    scope.filters.push({
                        type: '',
                        value: null,
                        operator: ''
                    });
                }
                
                scope.removeFilter = function(index) {
                    if (scope.filters.length > 1) {
                        scope.filters.splice(index, 1);    
                    }                    
                }

                templateLoader().success(function(html) {
                    root = angular.element(html);
                    //element.html(html);
                }).then(function (response) {
                    element.replaceWith($compile(root.contents())(scope));
                });
            }
        }
    }])