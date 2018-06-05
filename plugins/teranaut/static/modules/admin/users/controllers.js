'use strict';

angular.module('teranaut.admin.users').controller('AdminUserListController', 
    ['$scope', '$routeParams', '$location', '$modal', 'uiNotices', 'adminUserData', 'teranautModuleBase',
function ($scope, $routeParams, $location, $modal, uiNotices, adminUserData, teranautModuleBase) {
    
    var uiController = {
        /* 
         * We have to be handed the scope from the search directive since it is isolated.
         * TODO: see if there's a cleaner way.
         */
        // This will be attached by the calling scope
        getScope: null,
        newUser: function() {
            uiNotices.clear();
            this.getScope().searchui.resetContext(true);
            $location.path("/admin/users/new")
        },
        edit: function(username) {
            uiNotices.clear();
            $location.path("/admin/users/edit/" + username)
        },
        remove: function(username) {
            uiNotices.clear();

            // Not allowed to remove the user named admin.
            if (username === 'admin' || username === $scope.activeUser.username) return;

            // TODO: find a cleaner way rather than poping a dialog right here.
            if (confirm("Are you sure you want to remove the user: " + username + "?")) {
                var user = adminUserData.getUser(username);
                var self = this;
                user.remove(function() {                    
                    uiNotices.success('Account removed');
                    self.getScope().searchui.loadData();                    
                });            
            }        
        }
    };    

    var fields = [
        {
            name: 'firstname',
            human_name: 'First Name',
            header: true,
            sortable: true            
        },
        {
            name: 'lastname',
            human_name: 'Last Name',
            header: true,
            sortable: true
        },
        {
            name: 'username',
            human_name: 'Username',
            header: true,
            sortable: true
        },
        {
            name: 'role',
            human_name: 'Role',
            header: true,
            sortable: true
        },
        {
            name: 'created',
            human_name: 'Date Created',
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
        title: "User Manager",
        context: 'user_manager',
        freshContext: true,
        engine: 'elasticsearch',
        collection: 'users',
        interactiveUI: true,
        dateToolbar: false,
        fields: fields,
        gridView: teranautModuleBase + '/admin/users/search-results.tpl.html',
        searchView: teranautModuleBase + '/admin/users/search-controls.tpl.html',
        toolbarView: teranautModuleBase + '/admin/users/search-toolbar.tpl.html',
        uiController: uiController,
        allowEmptyQuery: true,
        regexSearchFields: ['firstname', 'lastname', 'username', 'email']
    };
}]);

angular.module('teranaut.admin.users').controller('AdminEditUserController',
    ['$scope', '$location', '$routeParams', 'uiNotices', 'accountData', 'adminUserData', 'teranautAdminUserRoles',
function($scope, $location, $routeParams, uiNotices, accountData, adminUserData, teranautAdminUserRoles) {
    $scope.title = "Edit User";
    $scope.updating = true;
    $scope.roles = teranautAdminUserRoles;
    $scope.user = adminUserData.getUser($routeParams.username).get();
    
    $scope.update = function() {
        uiNotices.clear();

        if (!accountData.validate($scope.user)) return;
        
        accountData.getActiveUser().then(function(active_user) {
            $scope.user.client_id = active_user.client_id;
            if ($scope.user.password) $scope.user.hash = $scope.user.password;

            // These fields should not be sent up
            delete $scope.user.password;
            delete $scope.user.password2;

            var user = adminUserData.getUser($scope.user.username);
        
            user.update($scope.user, function() {
                uiNotices.success('User updated successfully');
                $location.path('/admin/users');
            }, 
            function(err) {
                uiNotices.error('Could not update account');
                if (err.data.code = 11000) {
                    uiNotices.error('Username is already in use');
                }
            });
        });    
    };

    $scope.cancel = function() {
        uiNotices.clear();
        $location.path('/admin/users');
    }
}]);

angular.module('teranaut.admin.users').controller('AdminNewUserController', 
    ['$scope', '$location', 'uiNotices', 'accountData', 'adminUserData', 'teranautAdminUserRoles',
function($scope, $location, uiNotices, accountData, adminUserData, teranautAdminUserRoles) {
    $scope.title = "New User";
    $scope.roles = teranautAdminUserRoles;
    $scope.user = { role: 'user' };

    $scope.create = function() {
        uiNotices.clear();

        if ($scope.user) {            
            
            if (!accountData.validate($scope.user)) return;

            if (!$scope.user.password) {
                uiMessages.error("Password is required");                
                return;
            }
                
            var user = adminUserData.newUser();
            
            accountData.getActiveUser().then(function(active_user) {
                $scope.user.client_id = active_user.client_id;
                $scope.user.hash = $scope.user.password;
                // These fields should not be sent up
                delete $scope.user.password;
                delete $scope.user.password2;
                user.save($scope.user, function() {
                    uiNotices.success('User created successfully');
                    $location.path('/admin/users');
                }, 
                function(err) {
                    uiNotices.error('Could not create account');
                    if (err.data.code = 11000) {
                        uiNotices.error('Username is already in use');
                    }
                });
            });                
        }
        else {
            uiNotices.error('Can not save an empty record');
        }        
    };

    $scope.cancel = function() {
        uiNotices.clear();
        $location.path('/admin/users');
    }

}]);