var nconf = require('./common/nconf');
var security = require('./common/security');
var q = require('q');
var Helpers = require('./common/helpers')

var githubScm = require('./scm/github')
var bitbucketScm = require('./scm/bitbucket')

module.exports.index = function (event, context, cb) {

    console.log("DEBUG:: PRINT EVENT", event)

    var scm;
    switch(event.path.serviceType) {
        case 'github':
            scm = githubScm;
            break;
        case 'bitbucket':
            scm = bitbucketScm;
            break;
        default:
            return cb('Service not supported', null);
    }

    return security.verify_token(event.token)
        .then(function(decoded){

            var scmClientPromise = scm.getClient(decoded)

            var chain = null;

            var page = event.query.page|0;
            if(event.path.orgId && event.path.repoId && event.path.prNumber) {
                chain = scm.getRepoPullrequest(scmClientPromise, event.path.orgId, event.path.repoId, event.path.prNumber)
            }
            else if(event.path.orgId && event.path.repoId){
                chain = scm.getRepoPullrequests(scmClientPromise, event.path.orgId, event.path.repoId, page)
            }
            else if(event.path.orgId && !event.path.repoId){

                if(event.path.orgId == decoded.Username){
                    //look up the user's repos
                    chain = scm.getUserRepos(scmClientPromise, event.path.orgId, page)
                }
                else{
                    chain = scm.getOrgRepos(scmClientPromise, event.path.orgId, page)
                }
            }
            else{
                //no org specified, list all the orgs for this user.
                if(page){
                    chain = scm.getOrgs(scmClientPromise, page)
                }
                else{
                    //chain = getOrgs(github, page)
                    chain = q.spread([scm.getUser(scmClientPromise), scm.getOrgs(scmClientPromise, page)], function(user, orgs){
                        orgs.unshift(user) //adds the user obj to the beginning of the array.
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

