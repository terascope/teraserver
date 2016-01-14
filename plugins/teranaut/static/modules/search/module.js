'use strict';

angular.module('teranaut.search', ['app.config', 'teranaut.notices', 'teranaut.data.mongodb', 'teranaut.data.elasticsearch',
    'ui.bootstrap', 'ui.select2', 'jmdobry.angular-cache', 'truncate', 'ngCsv'])

    .service('searchContextService',
        ['$location', '$timeout', '$routeParams', 'elasticsearchSearch', 'mongodbSearch',
    function($location, $timeout, $routeParams, elasticsearchSearch, mongodbSearch) {
        var contexts = {};
        var globalContext = null;

        function SearchContext(searchConfig) {
            this.searchConfig = searchConfig;
            this.reset();
            this.configure();
        }

        SearchContext.prototype.reset = function() {
            //this.startDate = new Date();
            //this.startDate.setDate(new Date().getDate() - 30);
            delete(this.startDate);
            delete(this.endDate);
            //this.dateRange = 30 * 24;
            this.dateRange = -1;

            this.startField = "last_e"
            this.endField = "last_e";

            this.uiResultPage = 1;
            this.uiResultCount = 0;

            // Apply the default searchConfig
            this.configure();

            // Clean the search fields.
            if (this.searchConfig.fields) {
                for (var i = 0; i < this.searchConfig.fields.length; i++) {
                    delete(this[this.searchConfig.fields[i].name]);
                }
            }

            // Clean any special fields
            var obj = this
            angular.forEach(this, function(value, field) {
                if (field[0] === '_') {
                    delete obj[field];
                }
            });

            // Clear the criteria
            delete this['criteria'];
        }

        SearchContext.prototype.resetPresentation = function() {
            this.uiResultPage = 1;
            this.uiResultCount = 0;
        },

        SearchContext.prototype.configure = function() {
            if (this.searchConfig) {
                if (this.searchConfig.pageSize) this.uiPageSize = this.searchConfig.pageSize;
                if (this.searchConfig.sortField) this.uiSortField = this.searchConfig.sortField;
                if (this.searchConfig.showFilters) this.uiShowFilters = this.searchConfig.showFilters;
                if (this.searchConfig.collapseFilters) this.uiCollapseFilters = this.searchConfig.collapseFilters;

                if (this.searchConfig.searchHours > 0) {
                    this.dateRange = this.searchConfig.searchHours;
                    this.startDate = new Date();
                    this.startDate.setHours(new Date().getHours() - this.dateRange);
                }

                if (this.searchConfig.history > 0) {
                    this.uiHistory = 30; // THis is the default for the menu
                }

                //if (this.searchConfig.clusterMap) this.uiClusterMap = this.searchConfig.clusterMap;

                if (this.searchConfig.engine === 'elasticsearch') {
                    if (! this.searchConfig.collection) {
                        console.log("Elasticsearch engine configured without specifying the collection to search.")
                    }

                    this.searchengine = elasticsearchSearch;
                }
                else if (this.searchConfig.engine === 'mongodb') {
                    if (! this.searchConfig.collection) {
                        console.log("MongoDB engine configured without specifying the collection to search.")
                    }

                    this.searchengine = mongodbSearch;
                }
            }
        }

        SearchContext.prototype.fieldConfig = function(name) {
            for (var i = 0; i < this.searchConfig.fields.length; i++) {

                var field = this.searchConfig.fields[i];
                if (field.name === name) return field;
            }
        },

        SearchContext.prototype.hasCriteria = function() {
            if (this.criteria || this.defaultCriteria) return true;
            else return false;
        },

        SearchContext.prototype.locationState = function() {
            var state = angular.copy(this);

            // remove properties that shouldn't be serialized
            // TODO: this doesn't feel clean.
            delete state.searchConfig;
            delete state.searchengine;

            return state;
        }

        /*
         * Return the context management API
         */
        return {
            /*
             * Return the currently active search context. If there is no active context
             * a new one is created automatically.
             */
            getActiveContext: function(config) {

                if (config.context && contexts.hasOwnProperty(config.context) && config.freshContext === false) {
                    var context = contexts[config.context];
// TODO: this configure won't take a new config. DO we really need this here?
                    //context.configure(config);

                    return context;
                }
                // TODO I don't think this is usable right now
                else if (globalContext) {
                    // Configure the context for the specifc search being preformed.
                    this.configure(globalContext, config);

                    return globalContext;
                }
                else {
                    var context = this.newContext(config);
                    if (config.context) {
                        contexts[config.context] = context;
                    }
                    else {
                        globalContext = context;
                    }

                    return context;
                }
            },

            /*
             * Create a new search context with default parameters and sets it as the activeContext
             */
            newContext: function(config) {
                return new SearchContext(config)
            },

            /*
             * Creates a clean context other than date ranges. Does not make the context the activeContext.
             */
            dateContext: function(config) {
                var context = new SearchContext(config)

                // If there's an active context we copy the date range from it.
                if (globalContext) {
                    context.startDate = globalContext.startDate;
                    if (globalContext.endDate) context.endDate = globalContext.endDate;
                    context.dateRange = globalContext.dateRange;
                }

                return context;
            },

            saveContext: function(context) {

                console.log(JSON.stringify(context));
            },

            // Removes all active contexts
            reset: function() {
                contexts = {};
                globalContext = null;
            }
        }
    }])

    .service('searchUIService', ['$location', '$filter', 'pageTitle', 'teranautModuleBase', 'uiNotices',
     function($location, $filter, pageTitle, teranautModuleBase, uiNotices) {
        return function(scope) {
            var scope = scope;
            //var config = config;
            //var searchService = this;
            var uiLoading = false;
            var activeQuery = null;

            //scope.search = searchService.getActiveContext(config);

            var controller = {
                newSearch: function() {
                    // Merge the form values with the URL params.
                    scope.search = scope.searchui.mergeParams(scope.search, $location.search())

                    // If we actually received criteria, put it in the URL
                    if (scope.search.hasCriteria()) scope.searchui.performSearch()

                    scope.searchui.loadData();
                },

                performSearch: function(criteria_update) {
                    // reset paging if the search was initiated by a form criteria update.
                    if (criteria_update) scope.search.resetPresentation();

                    $location.search(scope.search.locationState());

                },

                loadData: function() {
                    uiNotices.clear();

                    scope.searchui._setPageTitle();

                    // Prevent the query from being submitted multiple times while active.
                    var pendingQuery = JSON.stringify(scope.criteria);
                    if (! uiLoading || ( activeQuery !== pendingQuery )) {
                        scope.search.uiCollapseFilters = true;

                        //scope.search.uiLoading = true;
                        activeQuery = pendingQuery;
                        uiLoading = true;

                        scope.searchResultView = teranautModuleBase + '/search/grid-loading.tpl.html';

                        scope.search.searchengine.search(scope.search, function(count, results) {
                            scope.searchResults = results;
                            scope.search.uiResultCount = count;
                            if (scope.search.uiResultCount == 0) scope.search.uiResultCount = 1;


                            // If we have actual results swap to the grid display view.
                            if (results.length > 0) {
                                scope.searchResultView = scope.searchConfig.gridView;
                            }

                            scope.searchui.loadingDone()
                        });
                    }
                    else {
                        console.log("UI loading ignored");
                    }
                },

                reloadData: function() {
                    if (scope.searchui.isInteractive()) {
                        scope.searchui.performSearch(false);
                    }
                },

                loadingDone: function() {
                    //scope.search.uiLoading = false;
                    uiLoading = false;
                    activeQuery = null;
                    // $location.search(scope.search)
                },

                loadingInProgress: function() {
                    return uiLoading;
                },

                resetContext: function(no_reload) {
                    scope.search.reset()

                    // if we should reload the data do so.
                    if (! no_reload) {
                        scope.searchui.performSearch();
                    }
                    // otherwise just update the URL
                    else {
                        $location.search(scope.search.locationState());
                    }
                },

                // TODO: this may not be useful as it's not driven by the searchConfig
                resetPresentationContext: function() {
                    scope.search.uiResultPage = 1;
                    scope.search.uiResultCount = 0;
                    scope.search.uiPageSize = 15;
                    scope.search.uiSortField = null;
                    scope.search.uiShowFilters = true;
                    scope.search.uiClusterMap = true;
                    scope.search.uiCollapseFilters = true;
                    scope.search.uiHistory = 30;
                },

                setSort: function(field) {
                    if (! scope.searchui.isInteractive()) {
                        if (field) scope.search.uiSortField = field.value;
                        else scope.search.uiSortField = null;
                    }
                },

                toggleSort: function(field) {
                    if (field.sortable && scope.searchui.isInteractive()) {
                        if (scope.search.uiSortField == '-' + field.name) {
                            scope.search.uiSortField = field.name;
                        }
                        else {
                            //if (scope.search.uiSortField == field.name) {
                            scope.search.uiSortField = '-' + field.name;
                        }
                        //else {
                            //scope.search.uiSortField = null;
                        //}

                        scope.searchui.reloadData();
                    }
                },

                sortDescription: function() {
                    if (scope.search.uiSortField) {
                        var name = scope.search.uiSortField.replace(/^-/, '');

                        var field = scope.search.fieldConfig(name);
                        if (field) {
                            if (scope.search.uiSortField[0] == '-') {
                                return field.human_name + " descending"
                            }
                            return field.human_name + " ascending";
                        }
                    }

                    return "None";
                },

                sortClass: function(field) {
                    if (field.sortable && scope.searchui.isInteractive()) {
                        var css = 'sorting ';

                        if (field.name == scope.search.uiSortField) {
                            css += 'sorting_asc'
                        }
                        else if ('-' + field.name == scope.search.uiSortField) {
                            css += 'sorting_desc'
                        }

                        return css;
                    }

                    return '';
                },

                notifyDateRange: function() {
                    scope.search.dateRange = 0;
                    scope.searchui.reloadData();
                },

                setDateRange: function(hours) {
                    scope.search.dateRange = hours;
                    scope.search.endDate = null; // Range has no end date.

                    // Set the startDate if needed.
                    if (hours == -1) {
                        scope.search.startDate = null;
                    }
                    else {
                        scope.search.startDate = new Date();
                        scope.search.startDate.setHours(new Date().getHours() - hours);
                    }

                    scope.searchui.reloadData();
                },

                setHistory: function(history) {
                    scope.search.uiHistory = history;
                },

                setPage: function (pageNo) {
                    scope.search.uiResultPage = pageNo;
                    scope.searchui.waitingScreen = null;
                    scope.searchui.performSearch(false); // This should work whether interactive or not.
                },

                setPageSize: function (pageSize) {
                    scope.search.uiPageSize = pageSize;
                    scope.searchui.waitingScreen = null;
                    scope.searchui.reloadData();
                },

                expandFilters: function() {
                    scope.search.uiCollapseFilters = !scope.search.uiCollapseFilters;
                },

                mergeParams: function(search, params) {
                    for (var item in params) {
                        if (item == 'startDate' || item == 'endDate') {
                            search[item] = new Date(params[item]);
                        }
                        else {
                            search[item] = params[item];
                        }
                    }

                    return search
                },

                countSuccess: function(results) {
                    //scope.search.uiResultCount = count;

                    // We didn't get a full page of results so this is the end of the set.
                    if (results.length > (15 * scope.search.uiPageSize)) {
                        if (scope.search.uiResultPage >= 15) {
                            scope.search.uiResultCount = scope.search.uiPageSize * (scope.search.uiResultPage + 1);
                        }
                        else {
                            scope.search.uiResultCount = scope.search.uiPageSize * 15;
                        }
                    }
                    else {
                        scope.search.uiResultCount = results.length;
                    }

                    scope.searchui.loadingDone();
                },

                countError: function(error) {
                    // The result here should be 0 but pagination won't update if it is.
                    scope.search.uiResultCount = 1;

                    scope.searchui.loadingDone()
                },

                fieldActive: function(name) {
                    return $.inArray(name, scope.searchConfig.fields) != -1
                },

                isInteractive: function() {
                    return scope.searchConfig.interactiveUI || false;
                },

                activeUrl: function() {
                    var path = scope.search.searchengine.activeUrl(scope.search);

                    return $location.protocol() + '://' + $location.host() + ':' + $location.port() + path + '&token=YOUR_API_TOKEN';
                },

                exportCSV: function() {
                    var csvArray = [];
                    var allKeys = {};

                    // We have to collect all the keys so that we can generate the header
                    // and so that each object has a property for each key in the same order.
                    for (var i = 0; i < scope.searchResults.length; i++) {
                        var entry = scope.searchResults[i];

                        var keys = Object.keys(entry);
                        for (var j = 0; j < keys.length; j++) {
                            var key = keys[j];
                            allKeys[key] = key;
                        }
                    }

                    // Add the header.
                    csvArray.push(allKeys);

                    for (var i = 0; i < scope.searchResults.length; i++) {
                        var entry = scope.searchResults[i];

                        var newEntry = {};

                        var keys = Object.keys(allKeys);
                        for (var j = 0; j < keys.length; j++) {
                            var key = keys[j];
                            var field = entry[key];

                            // We combine any field that has multiple values into a single field
                            /*if( Object.prototype.toString.call( field ) === '[object Array]' ) {
                                newEntry[key] = field.join(',');
                            }
                            else*/
                            if (typeof field === 'object') {
                                newEntry[key] = JSON.stringify(field);
                            }
                            else {
                                newEntry[key] = field;
                            }
                        }

                        csvArray.push(newEntry);
                    }

                    return csvArray;
                },

                _setPageTitle: function() {
                    // Set the page title
                    // TODO: this use of criteria here will be problematic once filter controls
                    // expand
                    var title = scope.searchConfig.title;
                    if (scope.search.criteria) {
                        title += ' ' + scope.search.criteria + ' page: ' + scope.search.uiResultPage;
                    }

                    pageTitle.setTitle(title);
                }
            }

            return controller;
        }
    }])


    .directive('searchableGrid', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            scope: {
                searchConfig: '=config'
            },
            //transclude: true,
            controller: ['$scope', 'searchUIService', 'searchContextService',
             function($scope, searchUIService, searchContextService) {
                function mergeParams(search, params) {
                    for (var item in params) {
                        search[item] = params[item];
                    }

                    return search
                }

                var searchConfigDefault = {
                    title: 'Search',
                    context: '',
                    freshContext: false,
                    engine: 'mongodb',
                    collection: '',
                    interactiveUI: true,
                    dateField: 'date',
                    searchHours: -1,
                    history: null, // For time series indices. How many days are available.
                    dateToolbar: true,
                    filterToolbar: true,
                    gridToolbar: true,
                    defaultCriteria: '',
                    fields: [],
                    gridView: '',    // App controlled display of grid results
                    searchView: '',  // App controlled explicit filter view.
                    toolbarView: '', // App controlled toolbar. Will show as first toolbar in the stack.
                    uiController: null, // App provided object with functions to expose to the view.

                    pageSize: 25,
                    sortField: '',
                    showFilters: true,
                    collapseFilters: true
                };

                $scope.searchConfig = mergeParams(searchConfigDefault, $scope.searchConfig);

                if (! $scope.searchConfig.fields) {
                    console.error("Fields list is required")
                }

                // Setup a shortcut to the uiController
                if ($scope.searchConfig.uiController) {
                    $scope.uictrl = $scope.searchConfig.uiController;

                    // Give the uiController access to the isolated scope
                    // of the directive
                    $scope.uictrl.getScope = function() {
                        return $scope;
                    }
                }

                // Setup the headers for the table
                $scope.headers = [];
                for (var i = 0; i < $scope.searchConfig.fields.length; i++) {
                    var field = $scope.searchConfig.fields[i];
                    if (field.header) {
                        $scope.headers.push(field);
                    }
                }

                // Setup the history list
                if ($scope.searchConfig.history > 0) {
                    $scope.historyFields = []
                    for (var i = 1; i <= 30; i++) {
                        $scope.historyFields.push(i);
                    }
                    $scope.historyFields.push(45);
                    $scope.historyFields.push(60);
                    $scope.historyFields.push(75);
                    $scope.historyFields.push(90);
                }

                $scope.showAPI = false;

                $scope.searchui = searchUIService($scope);
                $scope.search = searchContextService.getActiveContext($scope.searchConfig);
                //$scope.searchui.loadData();
                $scope.searchui.newSearch();

            }],
            templateUrl: teranautModuleBase + '/search/searchable-grid.tpl.html'
        }
    }])

    .directive('searchPagination', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            templateUrl: teranautModuleBase + '/search/pagination.tpl.html'
        }
    }])
    .directive('searchAppToolbar', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            templateUrl: teranautModuleBase + '/search/toolbars/app-toolbar.tpl.html'
        }
    }])
    .directive('searchDateToolbar', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            templateUrl: teranautModuleBase + '/search/toolbars/date-toolbar.tpl.html'
        }
    }])
    .directive('dateRangeSelector', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            templateUrl: teranautModuleBase + '/search/toolbars/date-dropdown.tpl.html'
        }
    }])
    .directive('searchQueryToolbar', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            templateUrl: teranautModuleBase + '/search/toolbars/search-toolbar.tpl.html'
        }
    }])

    .directive('searchGridToolbar', ['teranautModuleBase', function(teranautModuleBase) {
        return {
            controller: ['$scope',
                function($scope) {
                    // Setup the sortable fields list for the table. Only needed for non-interactive mode
                    if (! $scope.searchui.isInteractive()) {
                        $scope.sortableFields = [];
                        for (var i = 0; i < $scope.searchConfig.fields.length; i++) {
                            var field = $scope.searchConfig.fields[i];
                            if (field.sortable) {
                                $scope.sortableFields.push({
                                    value: field.name,
                                    description: field.human_name + ': Ascending'
                                });

                                $scope.sortableFields.push({
                                    value: "-" + field.name,
                                    description: field.human_name + ': Decending'
                                });
                            }
                        }
                    }
                }],
            templateUrl: teranautModuleBase + '/search/toolbars/grid-toolbar.tpl.html'
        }
    }])

    .directive('toggleMenu', ['$document', '$location', function ($document, $location) {
        var openElement = null,
            closeMenu   = angular.noop;
        return {
            restrict: 'CA',
            link: function(scope, element, attrs) {

                scope.$watch('$location.path', function() { closeMenu(); });
                //element.parent().bind('click', function() { closeMenu(); });
                element.bind('click', function (event) {
                    var elementWasOpen = (element === openElement);

                    event.preventDefault();
                    event.stopPropagation();

                    if (!!openElement) {
                        closeMenu();
                    }

                    if (!elementWasOpen) {
                        element.parent().addClass('open');
                        openElement = element;
                        closeMenu = function (event) {
                            if (event) {
                                event.preventDefault();
                                event.stopPropagation();
                            }
                            $document.unbind('click', closeMenu);
                            element.parent().removeClass('open');
                            closeMenu = angular.noop;
                            openElement = null;
                        };
                        scope.closeMenu = closeMenu;
                      //$document.bind('click', closeMenu);
                    }
                });
            }
        };
    }])

    .directive('pivotMenu', ['accountData', function(accountData) {
        return {
            scope: {
                criteria: '@',
                value: '@',
                field: '@',
                context: '@',
                display: '@',
                type: '@'
            },
            controller: ['$scope', '$location', function($scope, $location) {
                $scope.pivot = function(field, value, append, path) {
                    var criteria = "";

                    if (! path) path = $location.path();

                    if (append) {
                        criteria = $scope.criteria + ' AND ' + field + ':' + '"' + value + '"';
                    }
                    else {
                        criteria = field + ':' + '"' + value + '"';
                    }


                    $location.path(path).search({criteria: criteria});
                }

                $scope.contextMenu = '<' + $scope.context + '-pivot-menu></' + $scope.context + '-pivot-menu>'

                if (! $scope.display) {
                    $scope.display = $scope.value;
                }

                // We need to know who the user is to restrict menus based on roles
                accountData.getActiveUser().then(function(active_user) {
                    $scope.activeUser = active_user;
                });
            }],
            template: '<div class="btn-group"><span class="pivot-value" tooltip="{{ ::value }}">{{ ::display }}</span> <a class="pivot-dropdown-toggle badge pivot-button">  <span class="caret caret-dropdown"></span> </a> </div>'
        }
    }])

    .directive('pivotDropdownToggle', ['$document', '$location', '$compile', function ($document, $location, $compile) {
        var openElement = null,
            closeMenu   = angular.noop;
        return {
            restrict: 'CA',
            link: function(scope, element, attrs) {
                element.parent().bind('click', function() { closeMenu(); });

                element.hover(
                    function (event) {
                        element.addClass('pivot-menu');
                    },
                    function (event) {
                        if (! (element === openElement)) element.removeClass('pivot-menu');
                    }
                )

                element.bind('click', function (event) {
                    var elementWasOpen = (element === openElement);

                    event.preventDefault();
                    event.stopPropagation();

                    if (!!openElement) {
                        closeMenu();
                    }

                    if (! elementWasOpen) {
                        var watcher = scope.$watch('$location.path', function() { closeMenu(); });

                        scope.$apply(function() {
                            var e = $compile(scope.contextMenu)

                            element.parent().append(angular.element(e(scope)));
                        })

                        element.addClass('pivot-menu');

                        element.parent().addClass('open');
                        openElement = element;

                        closeMenu = function (event) {
                            if (event) {
                                event.preventDefault();
                                event.stopPropagation();
                            }

                            watcher() // clear the closeMenu watch

                            $document.unbind('click', closeMenu);
                            element.parent().removeClass('open');
                            element.removeClass('pivot-menu');
                            closeMenu = angular.noop;
                            openElement = null;
                        };

                        $document.bind('click', closeMenu);
                    }
                });
            }
        };
    }])
    .run(['$templateCache', function($templateCache) {
        $templateCache.put("template/datepicker/datepicker.html",
    "<table>\n" +
    "  <thead>\n" +
    "    <tr class=\"text-center\">\n" +
    "      <th><button type=\"button\" class=\"btn btn-small pull-left\" ng-click=\"move(-1)\"><i class=\"icon-chevron-left\"></i></button></th>\n" +
    "      <th colspan=\"{{rows[0].length - 2 + showWeekNumbers}}\"><button type=\"button\" class=\"btn  btn-small btn-block\" ng-click=\"toggleMode()\"><strong>{{title}}</strong></button></th>\n" +
    "      <th><button type=\"button\" class=\"btn btn-small pull-right\" ng-click=\"move(1)\"><i class=\"icon-chevron-right\"></i></button></th>\n" +
    "    </tr>\n" +
    "    <tr class=\"text-center\" ng-show=\"labels.length > 0\">\n" +
    "      <th ng-show=\"showWeekNumbers\">#</th>\n" +
    "      <th ng-repeat=\"label in labels\">{{label}}</th>\n" +
    "    </tr>\n" +
    "  </thead>\n" +
    "  <tbody>\n" +
    "    <tr ng-repeat=\"row in rows\">\n" +
    "      <td ng-show=\"showWeekNumbers\" class=\"text-center\"><em>{{ getWeekNumber(row) }}</em></td>\n" +
    "      <td ng-repeat=\"dt in row\" class=\"text-center\">\n" +
    "        <button type=\"button\" style=\"width:100%;\" class=\"btn btn-small\" ng-class=\"{'btn-info': dt.selected}\" ng-click=\"select(dt.date)\" ng-disabled=\"dt.disabled\"><span ng-class=\"{muted: dt.secondary}\">{{dt.label}}</span></button>\n" +
    "      </td>\n" +
    "    </tr>\n" +
    "  </tbody>\n" +
    "</table>\n" +
    "");
    }]);