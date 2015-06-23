'use strict';

/*
 * This controller is for the drop down date selector UI.
 */
angular.module('teranaut.search').controller('DateRangeController',
    ['$scope', 
function ($scope) {
    $scope.startField = "last_e";
    $scope.endField = "last_e";

    // We don't want to directly manipulate the dates in the context.
    // So copy them and then copy back on apply.    
    $scope.$watch('search.startDate', function() {
        $scope.startDate = $scope.search.startDate;
    });

    $scope.$watch('search.endDate', function() {
        $scope.endDate = $scope.search.endDate;
    });

    $scope.$watch('startDate', function() {
        $scope.message = '';
    });

    $scope.$watch('endDate', function() {
        $scope.message = '';
    });
    
    $scope.dateUpdated = function() {
        $scope.message = '';
        // If the date was manually edited it will be a string 
        // and needs to convert back to a date.
        if (typeof $scope.startDate == 'string') {
            var date = new Date($scope.startDate);             
            if (date != 'Invalid Date') $scope.startDate = date;
            else $scope.message = 'Start date is not valid';
        }        

        if (typeof $scope.endDate == 'string') {            
            var date = new Date($scope.endDate);    
            if (date != 'Invalid Date') $scope.endDate = date;
            else $scope.message = 'End date is not valid.';
        }
    }

    $scope.applyDateRange = function() {
        $scope.message = '';
     
        var invalid = $scope.date_form.$invalid;
        if (invalid) {
            $scope.message = 'Dates must be valid.';
        }
        else if ($scope.endDate && $scope.startDate && ($scope.endDate.getTime() < $scope.startDate.getTime())) {
            $scope.message = 'End Date must come after Start Date.';
            invalid = true;
        }

        if (! invalid) {
            $scope.search.startDate = $scope.startDate;
            $scope.search.endDate = $scope.endDate;
            $scope.search.startField = $scope.startField;
            $scope.search.endField = $scope.endField;
            $scope.searchui.notifyDateRange();
            $scope.closeMenu();    
        } 
    }
}]);

function ISODateStr(date) {
    function pad(n) { return n < 10 ? '0' + n : n }
    var result = date.getUTCFullYear() + '-'
      + pad(date.getUTCMonth() + 1) + '-'
      + pad(date.getUTCDate()) + 'T'
      + pad(date.getUTCHours()) + ':'
      + pad(date.getUTCMinutes()) + ':'
      + pad(date.getUTCSeconds()) + 'Z';

    return 'ISODate("' + result + '")'; 
}