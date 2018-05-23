'use strict';

angular.module('teranaut.account').controller('LoginController', 
    ['$scope', '$location', '$http', '$cookies', '$routeParams', 'authService', 'accountData', 
function ($scope, $location, $http, $cookies, $routeParams, authService, accountData) {
    
    $scope.submit = function() {
        // This is a hack so that browser autofill will be able to fill in the form.
        $scope.username = $('#id_username').val();
        $scope.password = $('#id_password').val();
      
        $http.post('/login', {
            username: $scope.username,
            password: $scope.password,            
        }, {
            ignoreAuthModule: true
        }).
        success(function() {              
            $scope.message = "";       
            
            accountData.initActiveUser($scope.username).then(
                function(user) {                                    
                    $cookies.wappuser = $scope.username;
                    // Clear out the fields
                    $scope.username = "";
                    $scope.password = "";

                    authService.loginConfirmed();

                    // If we have an existing URL to route to use that, otherwise we go to the root.
                    if ($routeParams.returnURL) {
                        $location.path($routeParams.returnURL).search({});    
                    }
                    else {
                        $location.path('/').search({});
                    }
                },
                function(err) {
                    console.log("Error loading activeUser: " + err);
                }
            );            
        }).
        error(function(data, status) {
            console.log('what is the error on the client', data, status);

            $scope.message = "Could not log in. Please provide a valid username and password.";
        });
    }  
}]);

angular.module('teranaut.account').controller('LogoutController', 
    ['$scope', '$rootScope', '$http', '$location', '$cookies', 
function ($scope, $rootScope, $http, $location, $cookies) {   
    $http.get('/logout').success(function() {
        delete $cookies.wappuser;
        $rootScope.$broadcast('event:auth-loginRequired');
        $location.path('account/login').search({});
    }).error(function() {
        console.log("Error on logout");        
    });
}]);

angular.module('teranaut.account').controller('AccountUpdateController', 
    ['$scope', 'accountData', 'uiNotices',
function($scope, accountData, uiNotices) {    
    
    accountData.getActiveUser().then(function(activeUser) {
        $scope.user = activeUser
    });

    $scope.update = function() {        
        uiNotices.clear();
        if (! accountData.validate($scope.user)) return;

        var user = accountData.getUser($scope.user.username);
        $scope.user.updated = new Date();
        if ($scope.user.password) $scope.user.hash = $scope.user.password;

        user.update($scope.user, function() {            
            uiNotices.success('Account updated successfully');
        }, 
        function(err) {
            uiNotices.error('Could not update account');
        });
    }
}]);