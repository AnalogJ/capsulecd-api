require('dotenv').config();
var q = require('q');
var Constants = require('./common/constants');
var Helpers = require('./common/helpers');
var security = require('./common/security');

var githubScm = require('./scm/github')
var bitbucketScm = require('./scm/bitbucket')

//Dynamodb client setup
var AWS = require("aws-sdk");
var docClient = new AWS.DynamoDB.DocumentClient({
    convertEmptyValues: true
});


module.exports = {
    connect: function(event, context, cb) {
        var url
        switch(event.path.serviceType) {
            case 'github':
                url = githubScm.authorizeUrl()
                break;
            case 'bitbucket':
                url = bitbucketScm.authorizeUrl()
                break;
            default:
                return cb('Service not supported', null);
        }

        var response = {url:url};

        return cb(null, response)
        //var error = new Error('testing error response');
        ////var error = {message:'this is the error response status: 400', status:400};
        //return Helpers.errorHandler(cb)(error);
    },
    callback: function(event, context, cb) {

        var swapTokenPromise

        switch(event.path.serviceType) {
            case 'github':
                swapTokenPromise = githubScm.swapOAuthToken(event.query.code)
                break;
            case 'bitbucket':
                swapTokenPromise = bitbucketScm.swapOAuthToken(event.query.code)
                break;
            default:
                return cb('Service not supported', null);
        }

        return swapTokenPromise
            .then(function(entry){
                console.log("[DEBUG]ENTRY", entry)

                var params = {
                    TableName: Constants.users_table,
                    Item: entry
                };

                var db_deferred = q.defer();
                docClient.put(params, function(err, data) {
                    if (err)  return db_deferred.reject(err);
                    return db_deferred.resolve({
                        "ServiceType": event.path.serviceType,
                        "ServiceId": entry.ServiceId,
                        "Username": entry.Username,
                        "Name": entry.Name,
                        "AccessToken": entry.AccessToken,
                        "RefreshToken": entry.RefreshToken
                    });
                });
                return db_deferred.promise
            })
            .then(security.sign_token)
            .then(function(jwt){
                return cb(null, {
                    token: jwt,
                    service_type: event.path.serviceType
                })
            })
            .fail(Helpers.errorHandler(cb))
    }
}