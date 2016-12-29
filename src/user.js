require('dotenv').config();
var security = require('./common/security');
var q = require('q');
var Helpers = require('./common/helpers')
var user_table = process.env.STAGE + '-capsulecd-api-users';
var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    dynamodb: '2012-08-10'
    // other service API versions
};

var docClient = new AWS.DynamoDB.DocumentClient();

module.exports.index = function (event, context, cb) {


    return security.verify_token(event.token)
        .then(function(decoded){

            return findUser(decoded)
        })
        .then(function(payload){
            //return it to the callback
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};


function findUser(auth){
    var params = {
        TableName : user_table,
        KeyConditionExpression: "ServiceType = :serviceType and Username = :username",
        ExpressionAttributeValues: {
            ":serviceType":auth.ServiceType,
            ":username": auth.Username
        }
    };
    var db_deferred = q.defer();
    docClient.query(params, function(err, data) {
        if (err)  return db_deferred.reject(err);

        return db_deferred.resolve(data.Items[0]);
    });
    return db_deferred.promise
}