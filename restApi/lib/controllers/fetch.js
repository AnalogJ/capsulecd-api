var security = require('../security');
//node-github client setup
var GitHubApi = require("github");
var q = require('q');
var Helpers = require('../helpers')

module.exports = function (event, cb) {
    var github = new GitHubApi({
        version: "3.0.0"
    });

    if(event.serviceType != 'github'){
        return cb('Service not supported', null);
    }


    return security.verify_token(event.auth)
        .then(function(decoded){
            //retrieve data from github api.
            github.authenticate({
                type: "oauth",
                token: decoded.AccessToken
            });

            var deferred = q.defer();

            var page = page|0;
            if(event.orgId && event.repoId){
                //repo and org specified, print the specific repo information
                github.repos.get({user:event.orgId, repo:event.repoId}, function(err, data){
                    if (err) return deferred.reject(err);
                    return deferred.resolve(data);
                })
            }
            else if(event.orgId && !event.repoId){
                //org specified find all repos
                github.repos.get({org:event.orgId, page:page}, function(err, data){
                    if (err) return deferred.reject(err);
                    return deferred.resolve(data);
                })
            }
            else{
                //no org specified, list all the orgs for this user.
                github.user.getOrgs({page:page}, function(err, data){
                    if (err) return deferred.reject(err);
                    return deferred.resolve(data);
                })
            }
            return deferred.promise
        })
        .then(function(payload){
            //return it to the callback
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};