require('dotenv').config();
var security = require('./common/security');
var constants = require('./common/constants');
var Helpers = require('./common/helpers');
var q = require('q');
var GitHubApi = require("github");

var project_table = process.env.STAGE + '-capsulecd-api-projects';
var user_table = process.env.STAGE + '-capsulecd-api-users';


//Dynamodb client setup
var AWS = require("aws-sdk");
var docClient = new AWS.DynamoDB.DocumentClient();

module.exports.index = function (event, cb) {
    var github = new GitHubApi({
        version: "3.0.0"
    });

    if(!event.path.serviceType || !event.path.orgId || !event.path.repoId){
        return cb(new Error('service, org and repo are all required'))
    }
    if(event.path.serviceType != 'github'){
        return cb('Service not supported', null);
    }
    var pr_number = event.body.number;
    if(event.body.action != "opened" && event.body.action != "reopened"){
        return cb(null, {
            message: "This is an unsupported action type. Ignoring.",
            action: event.body.action,
            payload:event
        })
    }

    // 1 - query project table
    var params = {
        TableName : project_table,
        KeyConditionExpression: "ServiceType = :serviceType and Id = :id",
        ExpressionAttributeValues: {
            ":serviceType": event.path.serviceType,
            ":id": event.path.orgId + '/' + event.path.repoId
        }
    };
    var db_deferred = q.defer();
    docClient.query(params, function(err, data) {
        if (err)  return db_deferred.reject(err);
        if (data.Count == 0) return db_deferred.reject(new Error('No project found'));
        if (data.Count > 1) return db_deferred.reject(new Error('Could not determine project.'));

        return db_deferred.resolve(data.Items[0]);
    });
    return db_deferred.promise
        // 2 - query the user table for api key
        .then(function(project){
            var params = {
                TableName : user_table,
                KeyConditionExpression: "ServiceType = :serviceType and Username = :username",
                ExpressionAttributeValues: {
                    ":serviceType": event.path.serviceType,
                    ":username": project.OwnerUsername
                }
            };
            var user_deferred = q.defer();
            docClient.query(params, function(err, data) {
                if (err)  return user_deferred.reject(err);
                if (data.Count == 0) return user_deferred.reject(new Error('No user found'));
                if (data.Count > 1) return user_deferred.reject(new Error('Could not determine user.'));
                return user_deferred.resolve(data.Items[0]);
            });
            return user_deferred.promise
        })
        // 3 - find the pull request by querying the github api, validate the pull request status (open)
        .then(function(user){
            //authenticate and retrieve user data.
            github.authenticate({
                type: "oauth",
                token: security.decrypt(user.AccessToken)
            });

            var deferred_user = q.defer();
            github.pullRequests.get({
                user: event.path.orgId,
                repo: event.path.repoId,
                number: pr_number
            }, function(err, data){
                if (err) return deferred_user.reject(err);
                if (data.state != "open") return deferred_user.reject(new Error('This pull request is closed.'));
                return deferred_user.resolve(data);
            });
            return deferred_user.promise
        })
        // 4 - query the existing comments on the github pull request (if this is a reopened PR)
        //.then(function(pullrequest){
        //    //check if the pullrequest has comments. comments
        //    return pullrequest.comments > 0 ? false : findCapsuleCDComment(github, event.orgId, event.repoId, pr_number));
        //})
        // 5 - add a new comment to the PR if needed
        .then(function(pullrequest){
            //Assume that the CapsuleCD comment is always the first one. If the PR has atleast one comment, theres no need to write a new CapsuleCD one.
            if(pullrequest.comments > 0) return null;

            var capsulecd_github = new GitHubApi({
                version: "3.0.0"
            });

            //we have to write this comment as the CapsuleCD user.
            capsulecd_github.authenticate({
                type: "oauth",
                token: process.env.GITHUB_CAPSULECD_USER_TOKEN
            });

            var deferred_comment = q.defer();
            capsulecd_github.issues.createComment({
                user: event.path.orgId,
                repo: event.path.repoId,
                number: pr_number,
                body: [
                    'Hi.',
                    '',
                    "I'm an automated pull request bot named [CapsuleCD](http://www.github.com/AnalogJ/capsulecd). I handle testing, versioning and package releases for this project. ",
                    "- If you're the owner of this repo, you can click the button below to kick off the CapsuleCD build pipeline and create an automated release.'",
                    "- If not, don't worry, someone will be by shortly to check on your pull request. ",
                    '',
                    '[![CapsuleCD](https://img.shields.io/badge/CapsuleCD-%E2%96%BA-blue.svg)]('+constants.web_endpoint+'/deploy/'+event.path.serviceType +'/'+ event.path.orgId +'/'+event.path.repoId+'/pullrequests/' + pr_number +')',
                    '',
                    '---',
                    "If you're interested in learning more about [CapsuleCD](http://www.github.com/AnalogJ/capsulecd), or adding it to your project, you can check it out [here](http://www.github.com/AnalogJ/capsulecd)"
                ].join('\n')
            }, function(err, data){
                if (err) return deferred_comment.reject(err);
                return deferred_comment.resolve(data);
            });
            return deferred_comment.promise
        })
        .then(function(payload){
            //return it to the callback
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};

//
//function findCapsuleCDComment(github_client, orgId, repoId, pr_number){
//    var deferred_comments = q.defer();
//    github_client.pullRequests.getComments({
//        user: orgId,
//        repo: repoId,
//        number: pr_number
//    }, function(err, data){
//        if (err) return deferred_comments.reject(err);
//        for(var ndx in data){
//            if(data[ndx].user.login.toLowerCase() == constants.capsulecd_username.toLowerCase()){
//                return deferred_comments.resolve(true);
//            }
//        }
//        return deferred_comments.resolve(false);
//    });
//    return deferred_comments.promise
//}