var Constants = require('../common/constants');
var q = require('q');

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
        var bitbucket_client = new BitbucketApi()

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
                console.log("OAUTH_DATA", oauth_data)

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
                    "ServiceType": 'bitbucket',
                    "ServiceId": '' + data.user_profile.account_id,
                    "Username": data.user_profile.username,
                    "Name": data.user_profile.display_name,
                    "Email": "",
                    "Company": data.user_profile.website,
                    "Blog": "",
                    "Location": data.user_profile.location,
                    "AccessToken": security.encrypt(data.oauth_data.access_token),
                    "RefreshToken": security.encrypt(data.oauth_data.refresh_token),
                    "AvatarUrl": data.user_profile.links.avatar.href
                };
                return entry
            })
    }
}