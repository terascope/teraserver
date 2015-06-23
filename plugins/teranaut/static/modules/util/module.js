'use strict';

angular.module('teranaut.util', ['base64'])
    // TODO: this should be refactored into a module dedicated to the task
    .factory('socket', ['$rootScope', function ($rootScope) {
        var socket = new Primus({ 
            reconnect: {
                maxDelay: Infinity, 
                minDelay: 500, 
                retries: 10 
            }
        });

        return {
            on: function (eventName, callback) {
                socket.on(eventName, function () {  
                    var args = arguments;
                    $rootScope.$apply(function () {
                        callback.apply(socket, args);
                    });
                });
            },
            send: function (eventName, data, callback) {                
                socket.send(eventName, data, function () {
                    var args = arguments;
                 
                    $rootScope.$apply(function () {
                        if (callback) {
                            callback.apply(socket, args);
                        }
                    });
                })
            }
        };
    }])    
    
    .factory('pageTitle',
        ['appTitle', function(appTitle) {
            var title = appTitle;
            return {
                title: function() { 
                    return title; 
                },
                setTitle: function(newTitle) { 
                    title = appTitle + " " + newTitle 
                }
            };
    }])

    .controller('StubController', ['$scope', function($scope) {
        $scope.title = "Place Holder Controller";
    }])

    .directive('appVersion', ['version', function (version) {
        return {
            restrict: 'E',
            link: function(scope, element, attrs) {
                element[0].innerHTML = version;
            }
        }
    }])

    .directive('timezone', ['$filter', function ($filter) {
        return {
            restrict: 'E', 
            link: function(scope, element, attrs) {
                 
                element[0].innerHTML = " <span class='time'>(GMT" + $filter('timezone') + ")</span>";
            } 
        }    
    }])

    .directive("dateFormat", ['$filter', function(filter) {
        return {
            replace: false,
            restrict: "A",
            require: "?ngModel",
            link: function(scope, element, attrs, ngModel) {                               
                if (! ngModel) {
                    return;
                }

                ngModel.$render = function() {
                    return element.val(ngModel.$viewValue);
                };

                var dateFilter = filter('date');
                return ngModel.$formatters.push(function(value) {
                    return dateFilter(value, 'medium');
                });
            }
        };
    }])

    .filter('interpolate', function (version) {
        return function (text) {
            return String(text).replace(/\%VERSION\%/mg, version);
        }
    }).
    filter('duration', function () {
        return function (text) {
            if (text > 1) {
                if (text > 60) {
                    if (text > 60 * 60) {
                        if (text > 24 * 60 * 60) {
                            var days = Math.floor(((text / 60) / 60) / 24);
                            var hours = Math.round((text - (days * 60 * 60 * 24)) / (60 * 60));   

                            var result = ""
                            if (days > 1) result += days + " days";
                            else result += days + " day";
                            
                            if (hours > 2) result += " " + hours + " hours";                                 
                            else if (hours == 1) result += " " + hours + " hour";         
                            
                            return result                        
                        }
                        else {
                            var hours = Math.floor((text / 60) / 60);
                            var minutes = Math.round((text - (hours * 60 * 60)) / 60);   
                            var result = ""
                            if (hours > 1) result += hours + " hours";
                            else result += hours + " hour";
                            
                            if (minutes >= 2) {
                                result += " " + minutes + " minutes";     
                            }
                            else if (minutes == 1) {
                                result += " " + minutes + " minute";         
                            }
                            return result
                        }                        
                    }
                    else {
                        var minutes = Math.round(text / 60);
                        var result = "";
                        if (minutes >= 2) {
                            result = minutes + " minutes";     
                        }
                        else if (minutes < 2) {
                            result =  minutes + " minute";         
                        }

                        return result                        
                    }                    
                }
                return text + " seconds"
            }
            return "Fleeting";
        }
    }).
    filter('mac_address', function () {
        return function (text) {
            if (text) return String(angular.uppercase(text)).match( /.{1,2}/g ).join(":")
        }
    }).
    filter('base64_decode', ['$base64', function ($base64) {
        return function (ssid) {  
            if (ssid) return $base64.decode(ssid);    
            else return "";
        }
    }]).
    filter('uri_encode', function () {
        return function (value) { 
            return encodeURIComponent(value);
        }
    }).    
    filter('wt_date', ['$filter', function($filter) {
        return function(date) {
            if (date) {
                var date_format = $filter('date');
                
                return date_format(date, 'mediumDate') + " " + date_format(date, 'shortTime')    
            }
            
            return "No date available";
        }
    }]).
    filter('timezone', [function() {
        var rightNow = new Date();
        var jan1 = new Date(rightNow.getFullYear(), 0, 1, 0, 0, 0, 0);
        var temp = jan1.toGMTString();
        var jan2 = new Date(temp.substring(0, temp.lastIndexOf(" ")-1));
        var std_time_offset = (jan1 - jan2) / (1000 * 60 * 60);
        
        var june1 = new Date(rightNow.getFullYear(), 6, 1, 0, 0, 0, 0);
        temp = june1.toGMTString();
        var june2 = new Date(temp.substring(0, temp.lastIndexOf(" ")-1));
        var daylight_time_offset = (june1 - june2) / (1000 * 60 * 60);
        var dst;
        if (std_time_offset == daylight_time_offset) {
            dst = "0"; // daylight savings time is NOT observed
        } else {
            dst = "1"; // daylight savings time is observed
        }
        // TODO: this code needs a serious review. Previously it returned std_time_offset
        return daylight_time_offset
    }]);