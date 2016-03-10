var Constants = require('../constants');
var OAuth = require('oauth');
var OAuth2 = OAuth.OAuth2;
var github_client = new OAuth2(
    process.env.GITHUB_APP_CLIENT_KEY,
    process.env.GITHUB_APP_CLIENT_SECRET,
    'https://github.com',
    '/login/oauth/authorize',
    '/login/oauth/access_token'
);

module.exports = function(event, cb) {

    if(event.serviceType != 'github'){
        return cb('Service not supported', null);
    }

    var url = github_client.getAuthorizeUrl({
        'redirect_uri': 'http://www.capsulecd.com/callback.html?service_type=github', //Constants.lambda_endpoint + '/callback/github',
        'scope': 'user:email,repo,write:repo_hook'
    });

    var response = {url:url};

    return cb(null, response);
};