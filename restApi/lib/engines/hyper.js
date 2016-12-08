var fs = require('fs');
var q = require('q');
var security = require('../security');
var Hyper = require('hyper.js');
var aws4 = require('hyper-aws4');
var url = require('url');

module.exports = {
    start: function(project_data,event){
        var project = project_data.project;
        var token = project_data.token;

        var date_prefix = new Date().toISOString()
            .replace(/T/, '-')      // replace T with a space
            .replace(/\..+/, '')     // delete the dot and everything after
            .replace(/:/g,'-');

        var container_name = (date_prefix + '-' + event.serviceType + '-' + event.orgId + '-' + event.repoId + '-' + event.prNumber)
            .toLowerCase() //all chars should be lowercase
            .replace(/[^a-z0-9]/gmi, " ").replace(/\s+/g, "-"); // makesure we match hyper.js internal regex: [a-z0-9]([-a-z0-9]*[a-z0-9])?


        //TODO: setup aws logging to cloudwatch.
        var createContainerOpts = {
            Image: project.Settings.dockerImage,
            name: container_name,
            Env: [],
            Cmd: ["capsulecd", "start", "--source", event.serviceType, "--package_type", project.Settings.packageType],
            Labels: {
                "sh_hyper_instancetype": "s4"
            }
        };

        //loop through secrets, decrypt and set on the container options Env.
        var keys = Object.keys(project.Secrets);
        for(var ndx in keys){
            var key = keys[ndx];
            if(key == 'CAPSULE_RUNNER_PULL_REQUEST' || key == 'CAPSULE_RUNNER_REPO_FULL_NAME'){ continue; }
            var decrypted_value = security.decrypt(project.Secrets[key].enc_value);
            createContainerOpts.Env.push(key + '=' + decrypted_value);
        }
        //set values here
        createContainerOpts.Env.push("CAPSULE_RUNNER_PULL_REQUEST=" +event.prNumber);
        createContainerOpts.Env.push("CAPSULE_RUNNER_REPO_FULL_NAME="+project.OrgId + '/' + project.RepoId);
        //TODO: this value needs to be passed as a paramter/post data.
        //TODO: createContainerOpts.Env.push("CAPSULE_ENGINE_VERSION_BUMP_TYPE=" +event.prNumber);

        //access token is unique for each user
        createContainerOpts.Env.push("CAPSULE_SOURCE_GITHUB_ACCESS_TOKEN="+token);

        //create a new container on Hyper
        var hyper = new Hyper();
        var service_deferred = q.defer();
        hyper.createContainer(createContainerOpts, function (err, container) {
            if (err)  return service_deferred.reject(err);
            container.start(function (err, data) {
                if (err)  return service_deferred.reject(err);
                return service_deferred.resolve(container.id);
            });
        });
        return service_deferred.promise
    },
    //TODO: add a timed task to pull the lastest image for all containers, every 1 hour?
    pullImage: function(dockerImage){
        var hyper = new Hyper();
        var service_deferred = q.defer();
        hyper.pull(dockerImage, function (err, stream) {
            if (err)  return service_deferred.reject(err);
            return service_deferred.resolve({});
        });
        return service_deferred.promise
    },
    sign: function(project_data,event){
        //generate the url from the modem & _config options

        var request_url = url.format({
                protocol: 'https',
                slashes: true,
                hostname: 'us-west-1.hyper.sh'
                // pathname: options.path // this will incorrectly encode the '?' character.
            }) + '/v1.23/containers/'+project_data.Pending[event.prNumber]+'/logs?stream=true&follow=1&stderr=1&stdout=1&tail=1';

        var headers = aws4.sign({
            url: request_url,
            method: 'GET',
            credential: {
                accessKey: process.env.HYPER_ACCESS_KEY,
                secretKey:  process.env.HYPER_SECRET_KEY
            },
            headers: {},
            body: ''
        });


        return {
            url:request_url,
            signedHeaders: headers
        }

    }
}
