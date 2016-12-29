require('dotenv').config();
var security = require('./common/security');
var Helpers = require('./common/helpers');
var q = require('q');
var Constants = require('./common/constants');

var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    dynamodb: '2012-08-10'
    // other service API versions
};
var docClient = new AWS.DynamoDB.DocumentClient();

function findProject(auth, serviceType, orgId, repoId){
    var params = {
        TableName : Constants.projects_table,
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

function updateProjectStatus(auth, serviceType, orgId, repoId, prNumb, containerId){

    var expressionAttributeValues = {
        ":owner": auth.Username
    };
    updateExpression = "set Pending.#prnumb = :containerid";
    expressionAttributeNames = {'#prnumb': prNumb};
    expressionAttributeValues[':containerid'] = containerId

    var params = {
        TableName : Constants.projects_table,
        Key:{
            "ServiceType": serviceType,
            "Id": orgId + '/' + repoId
        },
        UpdateExpression: updateExpression,
        ConditionExpression: "OwnerUsername = :owner",
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    };

    var db_deferred = q.defer();
    docClient.update(params, function(err, data) {
        if (err)  return db_deferred.reject(err);
        return db_deferred.resolve({});
    })
    return db_deferred.promise
        .then(function(){
            return {}
        });
}


module.exports.index = function(event, context, cb) {

    //TODO: verify that this repo is owned by the user specified int he auth token.
    //TODO: retrieve config data,
    //TODO: create a new SINGLE USE TOKEN for this job.

    return security.verify_token(event.token)
        .then(function(decoded){
            return findProject(decoded, event.path.serviceType, event.path.orgId, event.path.repoId)
                .then(function(project_data){
                    return require('./engines/hyper').start(project_data, event);
                    // return require('../engines/dockercloud')(project_data, event)
                })
                .then(function(containerId){
                    return updateProjectStatus(decoded, event.path.serviceType, event.path.orgId, event.path.repoId, event.path.prNumber, containerId)
                })
        })
        .then(function(payload){
            //update the project so we know its currently being processed.
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};