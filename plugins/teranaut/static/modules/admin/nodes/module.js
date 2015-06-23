'use strict';

var VALID_LAT =/^(-?[1-8]?\d(?:\.\d{1,18})?|90(?:\.0{1,18})?)$/;
var VALID_LON =/^(-?(?:1[0-7]|[1-9])?\d(?:\.\d{1,18})?|180(?:\.0{1,18})?)$/;

angular.module('teranaut.admin.nodes', ['teranaut.notices', 'teranaut.data.mongodb'])

    .config(['$routeProvider', 'teranautModuleBase', function($routeProvider, teranautModuleBase) {        
            $routeProvider.
                when('/admin/nodes', {
                    templateUrl: teranautModuleBase + '/search/grid.tpl.html',
                    //templateUrl: teranautModuleBase + '/admin/nodes/index.tpl.html',
                    controller: 'AdminNodeListController'
                }).
                when('/admin/nodes/new', {
                    templateUrl: teranautModuleBase + '/admin/nodes/node-edit.tpl.html',
                    controller: 'AdminNewNodeController'
                }).
                when('/admin/nodes/edit/:node_id', {
                    templateUrl: teranautModuleBase + '/admin/nodes/node-edit.tpl.html',
                    controller: 'AdminEditNodeController'
                });
        }
    ])

    .provider('adminNodeData', function() {

        this.collection = 'nodes/';

        this.id_field = 'node_id';

        this.$get = ['$http', '$resource', 'accountData', 'uiNotices', 'mongodbData', function($http, $resource, accountData, uiNotices, mongodbData) {
            var collection = this.collection;
            var id_field = this.id_field;

            // Node cache
            var nodes_by_id = {};
            var node_list;
            var loadingCache = false;
            var cacheListeners = [];

            return {
                valid: true,

                getBaseUrl: function() {                    
                    return mongodbData.getBaseUrl() + '/' + collection
                },

                get: function(id) {
                    //return mongodbData.request(this.getBaseUrl() + username)  
                    return $resource(this.getBaseUrl() + ':id_field', { id_field: id }, { update: { method: 'PUT' } } )                 
                },

                getAll: function(config) {                                    
                    return mongodbData.getData(collection, config)                    
                },

                new: function() {
                    return $resource(this.getBaseUrl(), {}, { create: { method: 'PUT' } } )                 
                },
                
                getNodeName: function(node_id) {    
                    if (nodes_by_id[node_id]) return nodes_by_id[node_id].friendly_name;

                    return "";
                },

                loadNodeCache: function(client_id, done) {  
                    cacheListeners.push(done);

                    var obj = this;
                    if ( ! loadingCache ) {
                        loadingCache = true;

                        var config = {
                            conditions: JSON.stringify({client_id: client_id}),
                            //select: 'node_id friendly_name last_e location location_usage'
                        };

                        var complete = function(results) {
                            // Cache the results                              
                            node_list = results;

                            // Notify all the cache listeners that loading is complete
                            if (cacheListeners.length > 0) {
                                var cb;
                                while (cb = cacheListeners.pop()) {
                                    cb(results);    
                                }

                                loadingCache = false;                                
                            }    
                        }

                        var records = mongodbData.getData(collection, config);
                        records.then(function(results) { 

                            var tasks = results.length;
                            for (var i = 0; i < results.length; i++) {
                                nodes_by_id[results[i].node_id] = results[i];                            
                                
                                // For fixed nodes we keep the location from the node record. Otherwise
                                // we need to try to find the most current location
                                /*if (results[i].location_usage !== 'fixed') {
                                    var locationP = obj.getLastNodeLocation(results[i].node_id);
                                    locationP.then(function(locations) {
                                        if (locations.length > 0) {
                                            nodes_by_id[locations[0].node_id].location = locations[0].location;                                            
                                        }

                                        tasks--;                                        
                                        if (tasks === 0) complete(results);
                                    });
                                } 
                                else {
                                    tasks--;
                                    if (tasks === 0) complete(results);                                    
                                }*/
                            }      

                            complete(results);                
                        });    
                    }                                                        
                },

                getNodeCacheById: function() {
                    return nodes_by_id;
                },

                getNodeCache: function(cb) {
                    if (! node_list) {
                        var obj = this;
                        accountData.getActiveUser().then(function(activeUser) {
                            obj.loadNodeCache(activeUser.client_id, cb);
                        });
                    }
                    else {
                        cb(node_list);    
                    }                    
                },

                flushNodeCache: function() {
                    console.log("Flushing node cache");
                    node_list = null;  
                    var obj = this;
                    accountData.getActiveUser().then(function(activeUser) {
                        obj.loadNodeCache(activeUser.client_id);
                    });
                },

                validate: function(node) {
                    function isInt(value) { return !isNaN(parseInt(value, 10)) && parseInt(value, 10) == parseFloat(value); }

                    this.valid = true;

                    if (! node.hasOwnProperty(id_field)) this.invalid("Node ID is required");

                    if (! isInt(node[id_field])) this.invalid("Node ID must be an integer");                                            

                    if (! node.name) this.invalid("Node name is required");
                    if (! node.friendly_name) this.invalid("Node friendly name is required");
                    //if (! node.location_usage) return "You must specify the type of node"    

                    //if (node.location_usage == 'fixed' || node.location_usage == 'correction') {
                        //if (! node.location) return "Node initial location is required"
                        if (! node.lat) this.invalid("Node location latitude is required");
                        if (! node.lon) this.invalid("Node location longitude is required");    

                        if (! (VALID_LAT.test(node.lat) && VALID_LON.test(node.lon))) this.invalid("Node initial location is not a valid GPS coordinate");
                    //}
                    
                    return this.valid;
                },

                invalid: function(message) {
                    this.valid = false;
                    uiNotices.error(message);
                }
            }
        }];

        this.setCollection = function(collection) {
            this.collection = collection;
        };

        this.setIDField = function(id_field) {
            this.id_field = id_field;
        };
    })
    .filter('node_name', ['adminNodeData', function(adminNodeData) {
        return function(node_id) {
            return adminNodeData.getNodeName(node_id);
        }
    }]);