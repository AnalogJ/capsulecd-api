var security = require('../security');
var Helpers = require('../helpers');
var request = require('superagent');
var q = require('q');

var configuration = {
    baseEndpoint: 'https://dashboard.tutum.co/api/v1',
    username: 'analogj',
    apiKey: process.env.TUTUM_API_KEY
};

configuration.authorization = new Buffer(configuration.username+':'+configuration.apiKey).toString('base64');


function tutum_request(method, path, params, callback) {
    var body = {};

    var url = configuration.baseEndpoint;

    // Add leading and trailing slashes to the path if they do not exist
    url += path.replace(/^\/?/, '/').replace(/\/?$/, '/');

    callback = (typeof params === 'function') ? params : callback;

    method = method.toLowerCase();
    method = (method === 'delete') ? 'del' : method;

    if (method === 'post' || method === 'patch') {
        body = params;
    } else {
       // url += '?' + querystring.stringify(params);
    }

    request[method](url).
    send(body).
    set('Accept', 'application/json').
    set('Authorization', 'Basic ' + configuration.authorization).
    set('Content-Type', 'application/json').
    end(function(err, res){
            if (err) {
                return callback(err);
            }
            if (res.error) {
            return callback(res.error);
        }
        callback(null, res.body);
    });
};

function findProject(auth, serviceType, orgId, repoId){
    var params = {
        TableName : table,
        KeyConditionExpression: "ServiceType = :serviceType and Id = :id",
        FilterExpression: "OwnerUsername = :owner",
        ExpressionAttributeValues: {
            ":serviceType":serviceType,
            ":id":orgId + '/' + repoId,
            ":owner": auth.Username
        }
    };
    var db_deferred = q.defer();
    docClient.query(params, function(err, data) {
        if (err)  return db_deferred.reject(err);

        return db_deferred.resolve(data.Items[0]);
    });
    return db_deferred.promise
}

module.exports = function (event, cb) {

    //TODO: verify that this repo is owned by the user specified int he auth token.
    //TODO: retrieve config data,
    //TODO: create a new SINGLE USE TOKEN for this job.
    //TODO: set environmental variables.


    return security.verify_token(event.auth)
        .then(function(decoded){
            return findProject(decoded, event.serviceType, event.orgId, event.repoId)
        })
        .then(function(project){
            var date_prefix = new Date().toISOString()
                .replace(/T/, '-')      // replace T with a space
                .replace(/\..+/, '')     // delete the dot and everything after
                .replace(/:/g,'-');


            var env_vars = [];
            //loop through secrets, decrypt and set on the env.
            var keys = Object.keys(project.Secrets);
            for(var ndx in keys){
                var key = keys[ndx];
                if(key == 'CAPSULE_RUNNER_PULL_REQUEST' || key == 'CAPSULE_RUNNER_REPO_FULL_NAME'){ continue; }
                env_vars.push({"key":key, "value":project.Secrets[key]});
            }
            //set values here
            env_vars.push({"key":"CAPSULE_RUNNER_PULL_REQUEST","value":event.prNumber});
            env_vars.push({"key":"CAPSULE_RUNNER_REPO_FULL_NAME","value":project.OrgId + '/' + project.RepoId});
            //TODO: this key should be dynamically created for each project, and removed automaticaly afterwards.
            env_vars.push({"key":"CAPSULE_SOURCE_GITHUB_ACCESS_TOKEN","value":process.env.GITHUB_CAPSULECD_USER_TOKEN});

            var data = {
                "name": date_prefix + '-' + event.serviceType + '-' + event.orgId + '-' + event.repoId + '-' + event.prNumber,
                "image": project.Settings.dockerImage,
                "run_command": "capsulecd start --source "+event.serviceType+" --package_type " + project.Settings.packageType,
                "container_envvars": env_vars,
                "target_num_containers": 1,
                "autodestroy":"ALWAYS"
            };
            var service_deferred = q.defer();
            tutum_request('POST','/service/', data, function(err, res) {
                if (err)  return service_deferred.reject(err);
                return service_deferred.resolve(res);
            });
            return service_deferred.promise
        })
        .then(function(service){
            var start_deferred = q.defer();
            tutum_request('POST', '/service/' + service.uuid + '/start', {}, function(err, res) {
                if (err)  return start_deferred.reject(err);
                return start_deferred.resolve(res);
            });
            return start_deferred.promise
        })
        .then(function(payload){
            //return it to the callback
            return cb(null, payload)
        })
        .fail(Helpers.errorHandler(cb))
};