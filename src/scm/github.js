'use strict';
var Constants = require('../common/constants');
var q = require('q');
var security = require('../common/security');
var nconf = require('../common/nconf');

var OAuth = require('oauth');
var OAuth2 = OAuth.OAuth2;
var oauth_client = new OAuth2(
    nconf.get('GITHUB_APP_CLIENT_KEY'),
    nconf.get('GITHUB_APP_CLIENT_SECRET'),
    'https://github.com',
    '/login/oauth/authorize',
    '/login/oauth/access_token'
);

//node-github client setup
var GitHubApi = require("github");

module.exports = {
    //Link function

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

    },


    getClient: function(decodedAuthData){
        var github_client = new GitHubApi({
            version: "3.0.0"
        });
        github_client.authenticate({
            type: "oauth",
            token: decodedAuthData.AccessToken
        });
        return github_client
    },

    //Fetch Functions

    getUser: function(github_client){
        var deferred = q.defer();

        github_client.user.get({}, function(err, data){
            if (err) return deferred.reject(err);
            return deferred.resolve(data);
        })
        return deferred.promise
    },


    getOrgs: function(github_client, page){
        var deferred = q.defer();
        github_client.user.getOrgs({page:page}, function(err, data){
            if (err) return deferred.reject(err);
            return deferred.resolve(data);
        })
        return deferred.promise
    },

    getOrgRepos: function (github_client, orgId, page){
        var deferred = q.defer();
        github_client.repos.getFromOrg({org:orgId, page:page}, function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var Repository = require('../models/repository')
            var repo_list = data.map(function(repo){
                return new Repository(repo.name, repo.updated_at)
            })

            return deferred.resolve(repo_list);
        })
        return deferred.promise
    },

    getUserRepos: function (github_client, userId, page){
        var deferred = q.defer();
        github_client.repos.getAll({page: page}, function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var Repository = require('../models/repository')
            var repo_list = data.map(function(repo){
                return new Repository(repo.name, repo.updated_at)
            })

            return deferred.resolve(repo_list);
        })
        return deferred.promise
    },

    getRepoPullrequests: function (github_client, orgId, repoId, page){
        var deferred = q.defer();
        github_client.pullRequests.getAll({user:orgId, repo:repoId, state: 'open', page:page}, function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var PullRequest = require('../models/pullrequest')
            var prs = data.map(function(pr){
                return new PullRequest(pr.number, pr.title, pr.body, pr.html_url, pr.user.login, pr.user.html_url, pr.updated_at)
            })

            return deferred.resolve(prs);
        })
        return deferred.promise
    },

    getRepoPullrequest: function (github_client, orgId, repoId, prNumber){
        var deferred = q.defer();
        github_client.pullRequests.get({user:orgId, repo:repoId, number:prNumber},function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var PullRequest = require('../models/pullrequest')
            var pr = new PullRequest(data.number, data.title, data.body, data.html_url, data.user.login, data.user.html_url, data.updated_at)

            return deferred.resolve(pr);
        })
        return deferred.promise
    }

}