var nconf = require('./common/nconf');
var security = require('./common/security');
var Constants = require('./common/constants');
var Helpers = require('./common/helpers');
//node-github client setup
var GitHubApi = require("github");
var q = require('q');

var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    dynamodb: '2012-08-10'
    // other service API versions
};

var docClient = new AWS.DynamoDB.DocumentClient();

module.exports.index = function(event, context, cb){
        return security.verify_token(event.token)
            .then(function(auth){
                if(!event.path || !event.path.serviceType){
                    return findAllProject(auth, event)
                }
                else if(event.path.serviceType != 'github'){
                    throw new Error('Service not supported');
                }
                else if(!event.path.orgId || !event.path.repoId){
                    throw new Error('Organization and Repo name are required')
                }
                //serviceType, orgId and repoId are all present, determine the action
                else if(event.httpMethod == 'GET'){
                    return findOneProject(auth, event.path.serviceType, event.path.orgId, event.path.repoId, event)
                }
                else if(event.httpMethod == 'PUT'){
                    return updateProject(auth, event.path.serviceType, event.path.orgId, event.path.repoId, event)
                }
                else if(event.httpMethod == 'POST'){
                    return createProject(auth, event.path.serviceType, event.path.orgId, event.path.repoId, event)
                }
                else if(event.httpMethod == 'DELETE'){
                    return deleteProject(auth, event.path.serviceType, event.path.orgId, event.path.repoId, event)
                }
                else{
                    throw new Error('Unknown action.')
                }
            })
            .then(function(payload){
                //return it to the callback
                return cb(null, payload)
            })
            .fail(Helpers.errorHandler(cb))

    }



function findAllProject(auth, event){
    var params = {
        TableName : Constants.projects_table,
        FilterExpression: "OwnerUsername = :owner and ServiceType = :serviceType",
        ExpressionAttributeValues: {
            ":owner":auth.Username,
            ":serviceType":auth.ServiceType
        }
    };
    var db_deferred = q.defer();
    //TODO: determine a way to do a more efficient "query" operation instead of "scan" in DynamoDB
    //TODO: filter the data returned to only return the ids and names.
    docClient.scan(params, function(err, data) {
        if (err)  return db_deferred.reject(err);

        return db_deferred.resolve(data.Items);
    });
    return db_deferred.promise
}
function findOneProject(auth, serviceType, orgId, repoId, event){
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

        return db_deferred.resolve(data.Items[0]);
    });
    return db_deferred.promise
}
function createProject(auth, serviceType, orgId, repoId, event){
    var github = new GitHubApi({
        version: "3.0.0"
    });

    var entry = {
        "ServiceType": serviceType,
        "Id": orgId + '/' + repoId,
        "OrgId": orgId,
        "RepoId": repoId,
        "OwnerUsername": auth.Username,
        "Secrets": {},
        "Settings": {
            "dockerImage": "analogj/capsulecd",
            "packageType": "default",
            "versionIncr": "patch"
        },
        "Pending": {}
    };
    var params = {
        TableName:Constants.projects_table,
        Item: entry
    };

    var db_deferred = q.defer();
    docClient.put(params, function(err, data) {
        if (err)  return db_deferred.reject(err);
        //TODO:for some reason this data is empty. We'll send entry for now.
        return db_deferred.resolve(entry);
    });
    return db_deferred.promise
        .then(function(data){

            //authenticate and retrieve user data.
            github.authenticate({
                type: "oauth",
                token: auth.AccessToken
            });

            var deferred_hook = q.defer();
            github.repos.createHook({
                "user":orgId,
                "repo":repoId,
                "name":"web",
                "config": {
                    "url": Constants.lambda_endpoint + '/hook/github/' + orgId + '/' + repoId,
                    "content_type": "json"
                },
                "events":["pull_request"]
            }, function(err, hook_data){
                if (err) return deferred_hook.reject(err);

                //after creating the hook, return the database data.
                return deferred_hook.resolve(data);
            });
            return deferred_hook.promise
        })
        .then(function(){
            //authenticate and retrieve user data.
            github.authenticate({
                type: "oauth",
                token: auth.AccessToken
            });

            //TODO: does CapsuleCD need to be a collaborator anymore?
            var deferred_collab = q.defer();
            github.repos.addCollaborator({
                "user":orgId,
                "repo":repoId,
                "collabuser":"CapsuleCD"
            }, function(err, hook_data){
                if (err) return deferred_collab.reject(err);

                //after creating the hook, return the database data.
                return deferred_collab.resolve(hook_data);
            });
            return deferred_collab.promise

        })
}
function updateProject(auth, serviceType, orgId, repoId, event){

    var updateExpression = '';
    var expressionAttributeNames = null;
    var expressionAttributeValues = {
        ":owner": auth.Username
    };

    if(event.body.Settings){
        updateExpression = "set Settings = :settings";
        expressionAttributeValues[":settings"] = event.body.Settings;
    }
    else if(event.body.Secrets){

        updateExpression = "set Secrets.#secretname = :secretvalue";
        var secretname = Object.keys(event.body.Secrets)[0];
        var secretvalue = event.body.Secrets[secretname];
        expressionAttributeNames = {'#secretname': secretname};
        expressionAttributeValues[':secretvalue'] = {
            'enc_value': security.encrypt(secretvalue),
            'last4': (secretvalue.length > 4) ? secretvalue.substr(secretvalue.length - 4) : secretvalue.substr(secretvalue.length - 2)
        }
    }

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
        .then(function(data){
            //only pull the docker image if we're making changes to the settings, not secrets
            if(event.body.Settings) {
                return require('./engines/hyper').pullImage(event.body.Settings.dockerImage);
            }
            return {}
        })
        .then(function(){
            return {}
        });
}
function deleteProject(auth, serviceType, orgId, repoId, event){
    throw new Error('unsupported action')
    //TODO: delete entry in database and delete github webhook.
}