var request = require('superagent');
var q = require('q');
var security = require('../common/security');
var nconf = require('../common/nconf');

var configuration = {
    baseEndpoint: 'https://cloud.docker.com/api/app/v1',
    username: 'analogj',
    apiKey: nconf.get('TUTUM_API_KEY')
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

module.exports = function (project_data, event) {
    var project = project_data.project;
    var token = project_data.token;

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
        var decrypted_value = security.decrypt(project.Secrets[key].enc_value);
        env_vars.push({"key":key, "value":decrypted_value});
    }
    //set values here
    env_vars.push({"key":"CAPSULE_RUNNER_PULL_REQUEST","value":event.path.prNumber});
    env_vars.push({"key":"CAPSULE_RUNNER_REPO_FULL_NAME","value":project.OrgId + '/' + project.RepoId});
    //access token is unique for each user
    env_vars.push({"key":"CAPSULE_SOURCE_GITHUB_ACCESS_TOKEN","value":token});

    var data = {
        "nickname": date_prefix + '-' + event.path.serviceType + '-' + event.path.orgId + '-' + event.path.repoId + '-' + event.path.prNumber,
        "image": project.Settings.dockerImage,
        "run_command": "capsulecd start --source "+event.path.serviceType+" --package_type " + project.Settings.packageType,
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
        .then(function(service){
            var start_deferred = q.defer();
            tutum_request('POST', '/service/' + service.uuid + '/start', {}, function(err, res) {
                if (err)  return start_deferred.reject(err);
                return start_deferred.resolve(res);
            });
            return start_deferred.promise
        })
};


