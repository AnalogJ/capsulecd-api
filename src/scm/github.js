'use strict';
var Constants = require('../common/constants');
var q = require('q');
var security = require('../common/security');

var OAuth = require('oauth');
var OAuth2 = OAuth.OAuth2;
var oauth_client = new OAuth2(
    process.env.GITHUB_APP_CLIENT_KEY,
    process.env.GITHUB_APP_CLIENT_SECRET,
    'https://github.com',
    '/login/oauth/authorize',
    '/login/oauth/access_token'
);

//node-github client setup
var GitHubApi = require("github");

module.exports = {
    authorizeUrl: function(){
        var url = oauth_client.getAuthorizeUrl({
            'redirect_uri': Constants.web_endpoint + '/auth/callback/github', //Constants.lambda_endpoint + '/callback/github',
            'scope': 'user:email,repo,write:repo_hook'
        });
        return url
    },
    swapOAuthToken: function(code){
        var github_client = new GitHubApi({
            version: "3.0.0"
        });

        //function should swap code for OAuth token and user data.
        //trade for access token
        var deferred = q.defer();
        oauth_client.getOAuthAccessToken(
            code,
            {},
            function (err, access_token, refresh_token, results) {
                if (err) return deferred.reject(err);
                if(results.error) return deferred.reject(new Error(JSON.stringify(results)));

                var oauth_data = {'access_token': access_token, 'raw': results}
                return deferred.resolve(oauth_data);
            });

        return deferred.promise
            .then(function(oauth_data){
                console.log("OAUTH_DATA", oauth_data)

                //authenticate and retrieve user data.
                github_client.authenticate({
                    type: "oauth",
                    token: oauth_data.access_token
                });

                var deferred_user = q.defer();
                github_client.user.get({}, function(err, data){
                    if (err) return deferred_user.reject(err);
                    return deferred_user.resolve({user_profile:data, oauth_data:oauth_data});
                });
                return deferred_user.promise
            })
            .then(function(data){
                console.log("USER_DATA", data)
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
                var entry = {
                    "ServiceType": 'github',
                    "ServiceId": '' + data.user_profile.id,
                    "Username": data.user_profile.login,
                    "Name": data.user_profile.name,
                    "Email": data.user_profile.email,
                    "Company": data.user_profile.company,
                    "Blog": data.user_profile.blog,
                    "Location": data.user_profile.location,
                    "AccessToken": security.encrypt(data.oauth_data.access_token),
                    "AvatarUrl": data.user_profile.avatar_url
                };
            return entry
            })

    }



}