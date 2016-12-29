require('dotenv').config();
var security = require('./common/security');
//node-github client setup
var GitHubApi = require("github");
var q = require('q');
var Helpers = require('./common/helpers')

module.exports.index = function (event, context, cb) {
    var github = new GitHubApi({
        version: "3.0.0"
    });

    if(!event.path || event.path.serviceType != 'github'){
        return cb('Service not supported', null);
    }

    return security.verify_token(event.token)
        .then(function(decoded){

            github.authenticate({
                type: "oauth",
                token: decoded.AccessToken
            });

            var chain = null;

            var page = event.query.page|0;
            if(event.path.orgId && event.path.repoId && event.path.prNumber) {
                chain = getRepoPullrequest(github, event.path.orgId, event.path.repoId, event.path.prNumber)
            }
            else if(event.path.orgId && event.path.repoId){
                chain = getRepoPullrequests(github, event.path.orgId, event.path.repoId, page)
            }
            else if(event.path.orgId && !event.path.repoId){

                if(event.path.orgId == decoded.Username){
                    //look up the user's repos
                    chain = getUserRepos(github,page)
                }
                else{
                    chain = getOrgRepos(github, event.path.orgId, page)
                }
            }
            else{
                //no org specified, list all the orgs for this user.
                if(page){
                    chain = getOrgs(github, page)
                }
                else{
                    //chain = getOrgs(github, page)
                    chain = q.spread([getUser(github), getOrgs(github, page)], function(user, orgs){
                        orgs.unshift(user)
                        return orgs
                    })
                }
            }
            return chain
        })
        .then(function(payload){
            //return it to the callback
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};


function getUser(github){
    var deferred = q.defer();

    github.user.get({}, function(err, data){
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    })
    return deferred.promise
}


function getOrgs(github, page){
    var deferred = q.defer();
    github.user.getOrgs({page:page}, function(err, data){
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    })
    return deferred.promise
}

function getOrgRepos(github, orgId, page){
    var deferred = q.defer();
    github.repos.getFromOrg({org:orgId, page:page}, function(err, data){
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    })
    return deferred.promise
}

function getUserRepos(github, page){
    var deferred = q.defer();
    github.repos.getAll({page: page}, function(err, data){
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    })
    return deferred.promise
}

function getRepoPullrequests(github, orgId, repoId, page){
    var deferred = q.defer();
    github.pullRequests.getAll({user:orgId, repo:repoId, state: 'open', page:page}, function(err, data){
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    })
    return deferred.promise
}

function getRepoPullrequest(github, orgId, repoId, prNumber){
    var deferred = q.defer();
    github.pullRequests.get({user:orgId, repo:repoId, number:prNumber},function(err, data){
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    })
    return deferred.promise
}