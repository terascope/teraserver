'use strict';

angular.module('teranaut.admin.nodes').controller('AdminNodeListController', 
    ['$scope', '$routeParams', '$location', '$modal', 'adminNodeData', 'uiNotices', 'teranautModuleBase',
function ($scope, $routeParams, $location, $modal, adminNodeData, uiNotices, teranautModuleBase) {
    
    var uiController = {
        /* 
         * We have to be handed the scope from the search directive since it is isolated.
         * TODO: see if there's a cleaner way.
         */
        // This will be attached by the calling scope
        getScope: null,

        newNode: function() {
            uiNotices.clear();
            
            this.getScope().searchui.resetContext(true);

            $location.path("/admin/nodes/new");
        },

        edit: function(node_id) {
            uiNotices.clear();

            $location.path("/admin/nodes/edit/" + node_id);
        },

        remove: function(node_id) {
            uiNotices.clear();

            // TODO: find a cleaner way rather than poping a dialog right here.
            if (confirm("Are you sure you want to remove the node: " + node_id + "?")) {
                var node = adminNodeData.get(node_id);
                var self = this;
                node.remove(function() {
                    uiNotices.success("Node removed");
                    
                    adminNodeData.flushNodeCache();
                    
                    self.getScope().searchui.loadData(); 
                });            
            }        
        }
    }    

    var fields = [
        {
            name: 'node_id',
            human_name: 'Node ID',
            header: true,
            sortable: true            
        },
        {
            name: 'friendly_name',
            human_name: 'Node Name',
            header: true,
            sortable: true
        },
        {
            name: 'updated',
            human_name: 'Last Updated',
            type: 'date',
            header: true,
            sortable: true
        },           
        {
            name: 'empty',
            human_name: '',
            header: true
        }
    ];

    $scope.searchConfig = {
        title: "Node Manager",
        context: 'node_manager',
        freshContext: true,
        engine: 'mongodb',
        collection: 'nodes',
        interactiveUI: true,
        dateToolbar: false,
        fields: fields,
        gridView: teranautModuleBase + '/admin/nodes/search-results.tpl.html',
        searchView: teranautModuleBase + '/admin/nodes/search-controls.tpl.html',
        toolbarView: teranautModuleBase + '/admin/nodes/search-toolbar.tpl.html',
        uiController: uiController
    };
}]);

angular.module('teranaut.admin.nodes').controller('AdminEditNodeController', 
    ['$rootScope', '$scope', '$location', '$routeParams', '$timeout', 'uiNotices', 'accountData', 'adminNodeData', 
function($rootScope, $scope, $location, $routeParams, $timeout, uiNotices, accountData, adminNodeData) {
    $rootScope.message = null;
    $scope.title = "Edit Node";
    $scope.updating = true
    $scope.node = adminNodeData.get($routeParams.node_id).get(function() {
        // Extract the location values for easier manipulation
        if ($scope.node.location && $scope.node.location.coordinates) {
            $scope.node.lon = $scope.node.location.coordinates[0];
            $scope.node.lat = $scope.node.location.coordinates[1];
        }
    });

    $scope.update = function() {
        uiNotices.clear();
      
        if (! adminNodeData.validate($scope.node)) return;

        accountData.getActiveUser().then(function(active_user) {
            $scope.node.client_id = active_user.client_id;
            // Baucis does an explicit comparison on node_id to the node_id passed in params.
            // The express parser hands that param to Baucis as a string so we need to coerse 
            // the node ID here to a string too.
            $scope.node.node_id = "" + $scope.node.node_id;    

            //if ($scope.node.location_usage == 'fixed' || $scope.node.location_usage == 'correction') {        
                // Since we edited the location in a different place we can just replace the location
                // structure whether adding or updating.            
                $scope.node.location = {
                    type: 'Point',
                    coordinates: [$scope.node.lon, $scope.node.lat]
                }        
            //}

            var node = adminNodeData.get($scope.node.node_id);

            node.update($scope.node, function() {
                uiNotices.success('Node updated successfully');

                adminNodeData.flushNodeCache();
                
                $location.path('/admin/nodes');
            }, 
            function(err) {
                uiNotices.error('Could not update node');
                if (err.data.code = 11000) {
                    uiNotices.error('Node ID is already in use');
                }                        
            });
        });    
    }

    $scope.cancel = function() {
        uiNotices.clear();

        $location.path('/admin/nodes');
    }
}]);

angular.module('teranaut.admin.nodes').controller('AdminNewNodeController', 
    ['$rootScope', '$scope', '$location', '$timeout', 'uiNotices', 'accountData', 'adminNodeData', 
function($rootScope, $scope, $location, $timeout, uiNotices, accountData, adminNodeData) {
    $scope.title = "New Node";

    $scope.create = function() {
        uiNotices.clear();

        if ($scope.node) {
            if (! adminNodeData.validate($scope.node)) return;

            var node = adminNodeData.new();
                        
            accountData.getActiveUser().then(function(active_user) {
                $scope.node.client_id = active_user.client_id;
                //if ($scope.node.location_usage == 'fixed' || $scope.node.location_usage == 'correction') {        
                    // Since we edited the location in a different place we can just replace the location
                    // structure whether adding or updating.            
                    $scope.node.location = {
                        type: 'Point',
                        coordinates: [$scope.node.lon, $scope.node.lat]
                    }        
                //}
                
                node.save($scope.node, function() {
                    uiNotices.success('Node created successfully');

                    adminNodeData.flushNodeCache();

                    $location.path('/admin/nodes');
                }, 
                function(err) {
                    uiNotices.error('Could not create node');
                    if (err.data.code = 11000) {
                        uiNotices.error(': Node ID is already in use');
                    }
                });
            });    
        }
        else {
            uiNotices.error('Can not save an empty record');
        }        
    }

    $scope.cancel = function() {
        uiNotices.clear();

        $location.path('/admin/nodes');
    }
}]);