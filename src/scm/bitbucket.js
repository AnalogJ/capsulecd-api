'use strict';
var Constants = require('../common/constants');
var q = require('q');
var security = require('../common/security');

var OAuth = require('oauth');
var OAuth2 = OAuth.OAuth2;
var oauth_client = new OAuth2(
    process.env.BITBUCKET_APP_CLIENT_KEY,
    process.env.BITBUCKET_APP_CLIENT_SECRET,
    'https://bitbucket.org',
    '/site/oauth2/authorize',
    '/site/oauth2/access_token',
    null
);

//node-bitbucket client setup
var BitbucketApi = require("bitbucket");

module.exports = {
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
    }
}