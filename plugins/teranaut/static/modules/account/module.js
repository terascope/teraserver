'use strict';

angular.module('teranaut.account', ['app.config', 'http-auth-interceptor', 'teranaut.notices', 'teranaut.data.mongodb'])
    .config(['$routeProvider', 'teranautModuleBase', function($routeProvider, teranautModuleBase) {        
            $routeProvider.
                when('/user/account', {
                    templateUrl: teranautModuleBase + '/account/index.tpl.html'
                }).
                when('/account/logout', {
                    templateUrl: teranautModuleBase + '/account/logout.tpl.html',
                    controller: 'LogoutController'
                }).
                when('/account/login', {
                    templateUrl: teranautModuleBase + '/account/login.tpl.html',
                    controller: 'LoginController'
                });
        }
    ])

    .run(['accountData', function(accountData) {            
        // Setup the initial user state
        accountData.initialize();
    }])

    .provider('accountData', function() {

        this.collection = 'users/';
        this.activeUser = null;

        this.$get = ['$http', '$resource', '$rootScope', '$cookies', '$location', 'authService', 'uiNotices', 'mongodbData', 
        function($http, $resource, $rootScope, $cookies, $location, authService, uiNotices, mongodbData) {
            var collection = this.collection;
            return {
                valid: true,

                getBaseUrl: function() {
                    return mongodbData.getBaseUrl() + '/' + collection
                },
                initActiveUser: function(username) {
                    this.activeUser = mongodbData.request(this.getBaseUrl() + username);
                    return this.activeUser;
                },
                getUser: function(username) {
                    //return mongodbData.request(this.getBaseUrl() + username)
                    return $resource(this.getBaseUrl() + ':username', { username: username }, { update: { method: 'PUT' } } )                 
                },
                getActiveUser: function() {
                    if (this.activeUser) {
                        return this.activeUser;    
                    }
                    else {
                        console.log("No active user is available")
                    }
                },

                // Try to load the user from a cookie
                initialize: function() {
                    // Setup the user and attempt to display the main content.
                    // If the user isn't really logged in the login page will show 
                    // again after the first data request.
                    if ($cookies.wappuser) {                            
                        // TODO: this looks fishy with no error handling
                        this.initActiveUser($cookies.wappuser).then(
                            function(user) {
                                $rootScope.activeUser = user;
                                authService.loginConfirmed();
                                $rootScope.hideLogin = true;
                            },
                            function(err) {
                                console.log("Error loading activeUser during initialization: " + err);
                            }
                        );            
                    }
                    else {
                        $location.path('/account/login');
                    }

                },

                validate: function(user) {
                    //TODO check about role here
                    this.valid = true;
                    if (!user.username) this.invalid("Username is required");
                    if (!user.role) this.invalid("Role is required");
                    if (!user.firstname) this.invalid("First name is required");
                    if (!user.lastname) this.invalid("Last name is required");
                    if (user.username.length < 4) this.invalid("Username must be at least 4 characters");
                    if ((user.password && user.password !== user.password2) || (user.password2 && !user.password)) this.invalid('Passwords do not match');
               
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
    })

    .directive('applicationAuth', ['$location', '$rootScope', function($location, $rootScope) {
        return {
            restrict: 'C',
            link: function(scope, elem, attrs) {
                //once Angular is started, remove class:
                elem.removeClass('waiting-for-angular');
            
                var main = elem.find('#main-content');
            
                scope.$on('event:auth-loginRequired', function() {     
                    var returnURL = $location.path();
                    $rootScope.hideLogin = false; // TODO: this really shouldn't be in the scope
                    $location.path('account/login').search({returnURL: returnURL});
                });
                /*scope.$on('event:auth-loginConfirmed', function() {
                    $('#login-dialog').hide()
                    $('#main-content').show();
                });*/
            }
        }
    }]);