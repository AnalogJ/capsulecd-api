require('dotenv').config();
var security = require('./common/security');
var Helpers = require('./common/helpers');
var q = require('q');

var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    dynamodb: '2012-08-10'
    // other service API versions
};
var docClient = new AWS.DynamoDB.DocumentClient();
var table = process.env.STAGE + '-capsulecd-api-projects';




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


module.exports.index = function (event, cb) {

    return security.verify_token(event.token)
        .then(function(decoded){
            return findProject(decoded, event.path.serviceType, event.path.orgId, event.path.repoId)
                .then(function(project_data){
                    return require('./engines/hyper').logs(project_data, event);
                    // return require('../engines/dockercloud')(project_data, event)
                })
        })
        .then(function(payload){
            //update the project so we know its currently being processed.
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};