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

var githubScm = {

    getClient: function(decodedAuthData){
        var github_client = new GitHubApi({
            version: "3.0.0"
        });
        github_client.authenticate({
            type: "oauth",
            token: decodedAuthData.AccessToken
        });
        return q(github_client)
    },

    //Link function

    authorizeUrl: function(){
        var url = oauth_client.getAuthorizeUrl({
            'redirect_uri': Constants.web_endpoint + '/auth/callback/github', //Constants.lambda_endpoint + '/callback/github',
            'scope': 'user:email,repo,write:repo_hook'
        });
        return url
    },
    swapOAuthToken: function(code){

        //function should swap code for OAuth token and user data.
        //trade for access token
        var deferred = q.defer();
        oauth_client.getOAuthAccessToken(
            code,
            {},
            function (err, access_token, refresh_token, results) {
                if (err) return deferred.reject(err);
                if(results.error) return deferred.reject(new Error(JSON.stringify(results)));

                var AuthData = require('../models/authdata');
                var oauth_data = new AuthData(access_token, '', results);
                return deferred.resolve(oauth_data);
            });

        return deferred.promise
            .then(function(oauth_data){

                var githubClientPromise = githubScm.getClient(oauth_data)

                return [q(oauth_data), githubScm.createCapsuleUser(githubClientPromise)]
            })
            .spread(function(oauth_data, user_data){

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
                user_data.ServiceType = 'github';
                user_data.AccessToken = security.encrypt(oauth_data.AccessToken);

                return user_data
            })

    },

    createCapsuleUser: function(githubClientPromise){
        return githubClientPromise
            .then(function(github_client){
                var deferred_user = q.defer();
                github_client.user.get({}, function(err, data){
                    if (err) return deferred_user.reject(err);
                    return deferred_user.resolve(data);
                });
                return deferred_user.promise
            })

            .then(function(userData){
            var CapsuleUser = require('../models/capsule_user');

            var user = new CapsuleUser();

            user.ServiceId = userData.id,
            user.Username = userData.login;
            user.Name = userData.name;
            user.Email = userData.email;
            user.Company = userData.company;
            user.Location = userData.location;
            user.AvatarUrl = userData.avatar_url;

            return user;
        })
    },

    //Fetch Functions

    getUser: function(githubClientPromise){
        return githubClientPromise
            .then(function(github_client){
                var deferred = q.defer();

                github_client.user.get({}, function(err, data){
                    if (err) return deferred.reject(err);
                    return deferred.resolve(data);
                })
                return deferred.promise
            })
    },


    getOrgs: function(githubClientPromise, page){
        return githubClientPromise
            .then(function(github_client){
                var deferred = q.defer();
                github_client.user.getOrgs({page:page}, function(err, data){
                    if (err) return deferred.reject(err);
                    return deferred.resolve(data);
                })
                return deferred.promise
            })
    },

    getOrgRepos: function (githubClientPromise, orgId, page){
        return githubClientPromise
            .then(function(github_client){
                var deferred = q.defer();
                github_client.repos.getFromOrg({org:orgId, page:page}, function(err, data){
                    if (err) return deferred.reject(err);

                    //transform
                    var Repository = require('../models/scm_repository')
                    var repo_list = data.map(function(repo){
                        return new Repository(repo.name, repo.updated_at)
                    })

                    return deferred.resolve(repo_list);
                })
                return deferred.promise
            })
    },

    getUserRepos: function (githubClientPromise, userId, page){
        return githubClientPromise
            .then(function(github_client) {
                var deferred = q.defer();
                github_client.repos.getAll({page: page}, function (err, data) {
                    if (err) return deferred.reject(err);

                    //transform
                    var Repository = require('../models/scm_repository')
                    var repo_list = data.map(function (repo) {
                        return new Repository(repo.name, repo.updated_at)
                    })

                    return deferred.resolve(repo_list);
                })
                return deferred.promise
            })
    },

    getRepoPullrequests: function (githubClientPromise, orgId, repoId, page){
        return githubClientPromise
            .then(function(github_client) {
                var deferred = q.defer();
                github_client.pullRequests.getAll({
                    user: orgId,
                    repo: repoId,
                    state: 'open',
                    page: page
                }, function (err, data) {
                    if (err) return deferred.reject(err);

                    //transform
                    var PullRequest = require('../models/scm_pullrequest')
                    var prs = data.map(function (pr) {
                        return new PullRequest(pr.number, pr.title, pr.body, pr.html_url, pr.user.login, pr.user.html_url, pr.updated_at)
                    })

                    return deferred.resolve(prs);
                })
                return deferred.promise
            })
    },

    getRepoPullrequest: function (githubClientPromise, orgId, repoId, prNumber){
        return githubClientPromise
            .then(function(github_client) {
                var deferred = q.defer();
                github_client.pullRequests.get({user: orgId, repo: repoId, number: prNumber}, function (err, data) {
                    if (err) return deferred.reject(err);

                    //transform
                    var PullRequest = require('../models/scm_pullrequest')
                    var pr = new PullRequest(data.number, data.title, data.body, data.html_url, data.user.login, data.user.html_url, data.updated_at)

                    return deferred.resolve(pr);
                })
                return deferred.promise
            })
    }

}

module.exports = githubScm