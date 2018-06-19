'use strict';

angular.module('teranaut.admin.users', ['app.config', 'teranaut.notices', 'teranaut.data.mongodb'])
    .config(['$routeProvider', 'teranautModuleBase', function($routeProvider, teranautModuleBase) {
            $routeProvider.
                when('/admin/users', {
                    templateUrl: teranautModuleBase + '/search/grid.tpl.html',
                    controller: 'AdminUserListController'
                }).
                when('/admin/users/new', {
                    templateUrl: teranautModuleBase + '/admin/users/user-edit.tpl.html',
                    controller: 'AdminNewUserController'
                }).
                when('/admin/users/edit/:username', {
                    templateUrl: teranautModuleBase + '/admin/users/user-edit.tpl.html',
                    controller: 'AdminEditUserController'
                });
        }
    ])

    .provider('adminUserData', function() {
        this.collection = 'users/';
        this.$get = ['$http', '$resource', 'mongodbData', function($http, $resource, mongodbData) {
            var collection = this.collection;
            return {
                getBaseUrl: function() {
                    return mongodbData.getBaseUrl() + '/' + collection
                },
                getUser: function(username) {
                    return $resource(this.getBaseUrl() + ':username', { username: username }, { update: { method: 'PUT' } } )
                },
                getUsers: function(config) {
                    return mongodbData.getData(collection, config)
                },
                newUser: function() {
                    return $resource(this.getBaseUrl(), {}, { create: { method: 'PUT' } } )
                }
            }
        }];

        this.setCollection = function(collection) {
            this.collection = collection;
        };
    })

    .filter('role_name', function (teranautAdminUserRoles) {
        return function (lookup) {
            for (var i = 0; i < teranautAdminUserRoles.length; i++) {
                var role = teranautAdminUserRoles[i];
                if (role.role === lookup) {
                    return role.name;
                }
            }
        }
    });