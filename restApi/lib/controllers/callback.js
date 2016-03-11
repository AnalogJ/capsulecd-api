var Constants = require('../constants');
var Helpers = require('../helpers');
var q = require('q');
var security = require('../security');
//Oauth client setup
var OAuth = require('oauth');
var OAuth2 = OAuth.OAuth2;
var github_client = new OAuth2(
    process.env.GITHUB_APP_CLIENT_KEY,
    process.env.GITHUB_APP_CLIENT_SECRET,
    'https://github.com',
    '/login/oauth/authorize',
    '/login/oauth/access_token'
);

//node-github client setup
var GitHubApi = require("github");



//Dynamodb client setup
var AWS = require("aws-sdk");
var docClient = new AWS.DynamoDB.DocumentClient();

// Callback should do the following:
// trade in the code for an access token
// use the access token to retrieve the user's basic information
// store the basic user info and access token in dynamo db.

module.exports = function(event, cb) {
    var github = new GitHubApi({
        version: "3.0.0"
    });

    if(event.serviceType != 'github'){
        throw 'Service not supported'
    }

    //trade for access token
    var deferred = q.defer();
    github_client.getOAuthAccessToken(
        event.code,
        {},
        function (err, access_token, refresh_token, results) {
            if (err) return deferred.reject(err);
            if(results.error) return deferred.reject(new Error(JSON.stringify(results)));

            var oauth_data = {'access_token': access_token, 'raw': results}
            return deferred.resolve(oauth_data);
        });

    return deferred.promise
        .then(function(oauth_data){
            //authenticate and retrieve user data.
            github.authenticate({
                type: "oauth",
                token: oauth_data.access_token
            });

            var deferred_user = q.defer();
            github.user.get({}, function(err, data){
                if (err) return deferred_user.reject(err);
                return deferred_user.resolve({user_profile:data, oauth_data:oauth_data});
            });
            return deferred_user.promise
        })
        .then(function(user_data){
            //store in dynamo db.
            //The following properties are stored in the User table:
            //ServiceType
            //ServiceId
            //Username
            //Name
            //Email
            //Company
            //Blog
            //Location
            //AccessToken

            //The table is keyed off of the ServiceType and Username.
            var table = process.env.SERVERLESS_DATA_MODEL_STAGE + '-' + process.env.SERVERLESS_PROJECT_NAME + '-users';
            var entry = {
                "ServiceType": 'github',
                "ServiceId": '' + user_data.user_profile.id,
                "Username": user_data.user_profile.login,
                "Name": user_data.user_profile.name,
                "Email": user_data.user_profile.email,
                "Company": user_data.user_profile.company,
                "Blog": user_data.user_profile.blog,
                "Location": user_data.user_profile.location,
                "AccessToken": security.encrypt(user_data.oauth_data.access_token)
            }
            //TODO: store the user's profile info
            var params = {
                TableName:table,
                Item: entry
            };

            var db_deferred = q.defer();
            docClient.put(params, function(err, data) {
                if (err)  return db_deferred.reject(err);
                //TODO:for some reason this data is empty. We'll send entry for now.
                return db_deferred.resolve({
                    "ServiceType": 'github',
                    "ServiceId": user_data.user_profile.id,
                    "Username": user_data.user_profile.login,
                    "Name": user_data.user_profile.name,
                    "AccessToken": user_data.oauth_data.access_token
                });
            });
            return db_deferred.promise
        })
        .then(security.sign_token)
        .then(function(jwt){
            return cb(null, {
                token: jwt,
                service_type: event.serviceType
        })
        })
        .fail(Helpers.errorHandler(cb))
};