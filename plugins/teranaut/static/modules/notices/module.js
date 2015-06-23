'use strict';

angular.module('teranaut.notices', [])
    .config(['$httpProvider', function($httpProvider) {        
        // Setup the system wide HTTP error handler.
        $httpProvider.interceptors.push('httpErrorInterceptor'); 
    }])

    // TODO: this should be changed to not store the message in rootScope
    .factory('httpErrorInterceptor', ['$q', '$rootScope', 'uiNotices', function($q, $rootScope, uiNotices) {
        return {
            response: function(response) {
                // Success
                $rootScope.systemError = null;                    
                
                return response;
            },
            responseError: function(response) {
                // Error
                if (response.status == 0) {
                    $rootScope.systemError = 'The server is currently unavailable. Please try again in a few minutes.';
                    return $q.reject(response);      
                }
                else {                      
                    //console.log('Got an HTTP error ' + response.status);
                    uiNotices.error(response.data.error);   
                    return $q.reject(response);      
                }
            }
        }            
    }])

    .service('uiNotices', ['$timeout', function($timeout) {
        return {
            errors: [],
            messages: [],

            success: function(message) {            
                var index = this.messages.push(message) - 1;
                var self = this;
                $timeout(function() {               
                    self.clearMessage(index);
                }, 5 * 1000);
            },

            error: function(message) {      
                this.errors.push(message) 
            },

            clear: function() {
                this.messages.length = 0;
                this.errors.length = 0;
            },

            clearError: function(index) {
                delete this.errors[index];
            },

            clearMessage: function(index) {
                delete this.messages[index];
            }
        }
    }])

    .directive('uiNotices', ['teranautModuleBase', function(teranautModuleBase) {        
        return {   
            scope: {},         
            controller: ['$scope', 'uiNotices', function($scope, uiNotices) {
                $scope.clearError = uiNotices.clearError;
                $scope.clearMessage = uiNotices.clearMessage;                
                $scope.errors = uiNotices.errors;
                $scope.messages = uiNotices.messages;
            }],
            templateUrl: teranautModuleBase + '/notices/notices.tpl.html'
        }
    }])