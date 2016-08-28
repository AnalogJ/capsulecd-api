var security = require('../security');
var Helpers = require('../helpers');
var q = require('q');

var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    dynamodb: '2012-08-10'
    // other service API versions
};
var docClient = new AWS.DynamoDB.DocumentClient();
var table = process.env.SERVERLESS_DATA_MODEL_STAGE + '-' + process.env.SERVERLESS_PROJECT + '-projects';




function findProject(auth, serviceType, orgId, repoId){
    var params = {
        TableName : table,
        KeyConditionExpression: "ServiceType = :serviceType and Id = :id",
        FilterExpression: "OwnerUsername = :owner",
        ExpressionAttributeValues: {
            ":serviceType":serviceType,
            ":id":orgId + '/' + repoId,
            ":owner": auth.Username
        }
    };
    var db_deferred = q.defer();
    docClient.query(params, function(err, data) {
        if (err)  return db_deferred.reject(err);

        return db_deferred.resolve({project:data.Items[0], token: auth.AccessToken});
    });
    return db_deferred.promise
}

module.exports = function (event, cb) {

    //TODO: verify that this repo is owned by the user specified int he auth token.
    //TODO: retrieve config data,
    //TODO: create a new SINGLE USE TOKEN for this job.

    return security.verify_token(event.auth)
        .then(function(decoded){
            return findProject(decoded, event.serviceType, event.orgId, event.repoId)
        })
        .then(function(project_data){
            return require('../engines/hyper').start(project_data, event);
            // return require('../engines/dockercloud')(project_data, event)
        })
        .then(function(payload){
            //we're sending back an empty object so we dont accidently leak hyper keys.
            return cb(null, {})
        })
        .fail(Helpers.errorHandler(cb))
};