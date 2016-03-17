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



module.exports = function (event, cb) {

    //TODO: verify that this repo is owned by the user specified int he auth token.
    //TODO: retrieve config data,
    //TODO: create a new SINGLE USE TOKEN for this job.
    //TODO: set environmental variables.


    return security.verify_token(event.auth)
        .then(function(){
            var date_prefix = new Date().toISOString()
                .replace(/T/, '-')      // replace T with a space
                .replace(/\..+/, '')     // delete the dot and everything after
                .replace(/:/g,'-');

            var data = {
                "name": date_prefix + '-' + event.serviceType + '-' + event.orgId + '-' + event.repoId + '-' + event.prNumber,
                "image": "analogj/capsulecd",
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