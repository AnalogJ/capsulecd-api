var security = require('../security');
var constants = require('../constants');
//node-github client setup
var GitHubApi = require("github");
var q = require('q');

var AWS = require("aws-sdk");
var docClient = new AWS.DynamoDB.DocumentClient();
var table = process.env.SERVERLESS_DATA_MODEL_STAGE + '-' + process.env.SERVERLESS_PROJECT_NAME + '-projects';

var self = {
    router: function(event,cb){
        return security.verify_token(event.auth)
            .then(function(auth){
                if(!event.serviceType){
                    return self.findAll(auth, event)
                }
                else if(event.serviceType != 'github'){
                    throw new Error('Service not supported');
                }
                else if(!event.orgId || !event.repoId){
                    throw new Error('Organization and Repo name are required')
                }
                //serviceType, orgId and repoId are all present, determine the action
                else if(event.httpMethod == 'GET'){
                    return self.findOne(auth, event.serviceType, event.orgId, event.repoId, event)
                }
                else if(event.httpMethod == 'PUT'){
                    return self.update(auth, event.serviceType, event.orgId, event.repoId, event)
                }
                else if(event.httpMethod == 'POST'){
                    return self.create(auth, event.serviceType, event.orgId, event.repoId, event)
                }
                else if(event.httpMethod == 'DELETE'){
                    return self.delete(auth, event.serviceType, event.orgId, event.repoId, event)
                }
                else{
                    throw new Error('Unknown action.')
                }
            })
            .then(function(payload){
                //return it to the callback
                return cb(null, payload)
            })
            .fail(function(err){
                return cb(err, null)
            });

    },
    findAll: function(auth, event){
        var params = {
            TableName : table,
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
    },
    findOne: function(auth, serviceType, orgId, repoId, event){
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

            return db_deferred.resolve(data.Items[0]);
        });
        return db_deferred.promise
    },
    create: function(auth, serviceType, orgId, repoId, event){

        var entry = {
            "ServiceType": serviceType,
            "Id": orgId + '/' + repoId,
            "OrgId": orgId,
            "RepoId": repoId,
            "OwnerUsername": auth.Username,
            "Secrets": {}
        };
        //TODO: store the user's profile info
        var params = {
            TableName:table,
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
                var github = new GitHubApi({
                    version: "3.0.0"
                });
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
                        "url": constants.lambda_endpoint + '/hook/github/' + orgId + '/' + repoId,
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
    },
    update: function(auth, serviceType, orgId, repoId, event){
        throw new Error('unsupported action')
    },
    delete: function(auth, serviceType, orgId, repoId, event){
        throw new Error('unsupported action')
        //TODO: delete entry in database and delete github webhook.
    }
};
module.exports = self