'use strict';
var Constants = require('../common/constants');
var q = require('q');
var security = require('../common/security');
var nconf = require('../common/nconf');

var OAuth = require('oauth');
var OAuth2 = OAuth.OAuth2;
var oauth_client = new OAuth2(
    nconf.get('BITBUCKET_APP_CLIENT_KEY'),
    nconf.get('BITBUCKET_APP_CLIENT_SECRET'),
    'https://bitbucket.org',
    '/site/oauth2/authorize',
    '/site/oauth2/access_token',
    null
);

//node-bitbucket client setup
var BitbucketApi = require("bitbucket");

module.exports = {

    //Link functions
    authorizeUrl: function(){
        return oauth_client.getAuthorizeUrl({response_type: 'code'});
    },
    swapOAuthToken: function(code){
        var bitbucket_client = new BitbucketApi();

        //function should swap code for OAuth token and user data.
        //trade for access token
        var deferred = q.defer();
        oauth_client.getOAuthAccessToken(
            code,
            {'grant_type':'authorization_code'},
            function (err, access_token, refresh_token, results) {

                if (err) return deferred.reject(err);
                if(results.error) return deferred.reject(new Error(JSON.stringify(results)));

                var oauth_data = {'access_token': access_token, refresh_token: refresh_token, 'raw': results}
                return deferred.resolve(oauth_data);
            });

        return deferred.promise
            .then(function(oauth_data){
                console.log("[DEBUG]OAUTH_DATA", oauth_data)

                //authenticate and retrieve user data.
                bitbucket_client.authenticate({
                    type: "oauth",
                    token: oauth_data.access_token
                });

                var deferred_user = q.defer();
                bitbucket_client.user.get({}, function(err, data){
                    if (err) return deferred_user.reject(err);
                    return deferred_user.resolve({user_profile:data.data, oauth_data:oauth_data});
                });
                return deferred_user.promise
            })
            .then(function(user_data){
                var deferred_email = q.defer();
                bitbucket_client.user.listEmails({}, function(err, result_data){
                    if (err) return deferred_email.reject(err);

                    var primary_email;
                    for(var ndx in result_data.data.values){
                        var current_email = result_data.data.values[ndx];
                        if(current_email.is_primary){
                            primary_email = current_email.email;
                            break
                        }
                    }

                    user_data.user_profile.email = primary_email;
                    return deferred_email.resolve(user_data);
                });
                return deferred_email.promise
            })
            .then(function(data){
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
                    "ServiceType": 'bitbucket',
                    "ServiceId": data.user_profile.account_id,
                    "Username": data.user_profile.username,
                    "Name": data.user_profile.display_name || '',
                    "Email": data.user_profile.email,
                    "Company": data.user_profile.website || '',
                    "Blog": "",
                    "Location": data.user_profile.location || '',
                    "AccessToken": security.encrypt(data.oauth_data.access_token),
                    "RefreshToken": security.encrypt(data.oauth_data.refresh_token),
                    "AvatarUrl": ''+data.user_profile.links.avatar.href
                };
                return entry
            })
    },

    refreshAccessToken: function(decodedAuthData){
        var deferred = q.defer();

        oauth_client.getOAuthAccessToken(
            decodedAuthData.RefreshToken,
            {'grant_type':'refresh_token'},
            function (err, access_token, refresh_token, results) {

                if (err) return deferred.reject(err);
                if(results.error) return deferred.reject(new Error(JSON.stringify(results)));

                var oauth_data = {'access_token': access_token, refresh_token: refresh_token, 'raw': results}
                return deferred.resolve(oauth_data);
            });
        return deferred.promise
    },

    getClient: function(decodedAuthData){
        var bitbucket_client = new BitbucketApi();

        //refresh token if necessary

        bitbucket_client.authenticate({
            type: "oauth",
            token: decodedAuthData.AccessToken
        });
        return bitbucket_client
    },

    //Fetch Functions

    getUser: function(bitbucket_client){
        var deferred = q.defer();

        bitbucket_client.user.get({}, function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var Organization = require('../models/organization')
            var bitbucket_user = new Organization(data.data.username, data.data.display_name, '', data.data.links.avatar.href);

            return deferred.resolve(bitbucket_user);
        })
        return deferred.promise
    },


    getOrgs: function(bitbucket_client, page){
        // var deferred = q.defer();
        // bitbucket_client.user.getOrgs({page:page}, function(err, data){
        //     if (err) return deferred.reject(err);
        //     return deferred.resolve(data);
        // })
        // return deferred.promise
        return q.resolve([])

    },

    getOrgRepos: function (bitbucket_client, orgId, page){
        // var deferred = q.defer();
        // bitbucket_client.repos.getFromOrg({org:orgId, page:page}, function(err, data){
        //     if (err) return deferred.reject(err);
        //     return deferred.resolve(data);
        // })
        // return deferred.promise
        return q.resolve([])
    },

    getUserRepos: function (bitbucket_client, userId, page){
        var deferred = q.defer();

        /*
        https://developer.atlassian.com/bitbucket/api/2/reference/resource/repositories/%7Busername%7D

        member: returns repositories to which the user has explicit read access
        contributor: returns repositories to which the user has explicit write access
        admin: returns repositories to which the user has explicit administrator access
        owner: returns all repositories owned by the current user

        * */

        bitbucket_client.repositories.list({username:userId, page: page, role: "contributor"}, function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var Repository = require('../models/repository')
            var repo_list = data.data.values.map(function(repo){
                return new Repository(repo.slug, repo.updated_on)
            })

            return deferred.resolve(repo_list);
        })

        return deferred.promise
    },

    getRepoPullrequests: function (bitbucket_client, orgId, repoId, page){
        var deferred = q.defer();
        bitbucket_client.repositories.listPullRequests({repo_slug:repoId, state: 'OPEN', username: orgId}, function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var PullRequest = require('../models/pullrequest')
            var prs = data.data.values.map(function(pr){
                return new PullRequest(pr.id, pr.title, pr.summary.raw, pr.links.html.href, pr.author.username, pr.author.links.html.href, pr.updated_on)
            })

            return deferred.resolve(prs);
        })
        return deferred.promise
    },

    getRepoPullrequest: function (bitbucket_client, orgId, repoId, prNumber){
        var deferred = q.defer();
        bitbucket_client.repositories.getPullRequest({username:orgId, repo_slug:repoId, pull_request_id:prNumber},function(err, data){
            if (err) return deferred.reject(err);

            //transform
            var PullRequest = require('../models/pullrequest')
            var pr = new PullRequest(data.data.id, data.data.title, data.data.summary.raw, data.data.links.html.href, data.data.author.username, data.data.author.links.html.href, data.data.updated_on)

            return deferred.resolve(pr);
        })
        return deferred.promise
    }
}