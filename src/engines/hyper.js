var fs = require('fs');
var q = require('q');
var security = require('../security');
var Hyper = require('hyper.js');
var aws4 = require('hyper-aws4');
var url = require('url');

function cleanLogs(docker_logs){
    //https://github.com/docker/docker/issues/7375
    var docker_log_array = docker_logs.split("\n")

    var cleaned_log_array = [];
    for(var ndx in docker_log_array){
        var  docker_log_line = docker_log_array[ndx]
        if(!docker_log_line){
            continue;
        }
        cleaned_log_array.push({
            stream: (docker_log_line.charCodeAt(0) == 1) ? 'stdout' : 'stderr',
            line: docker_log_line.substring(8)
        });
    }
    return cleaned_log_array
}


module.exports = {
    start: function(project_data,event){
        var project = project_data.project;
        var token = project_data.token;

        var date_prefix = new Date().toISOString()
            .replace(/T/, '-')      // replace T with a space
            .replace(/\..+/, '')     // delete the dot and everything after
            .replace(/:/g,'-');

        var container_name = (date_prefix + '-' + event.path.serviceType + '-' + event.path.orgId + '-' + event.path.repoId + '-' + event.path.prNumber)
            .toLowerCase() //all chars should be lowercase
            .replace(/[^a-z0-9]/gmi, " ").replace(/\s+/g, "-"); // makesure we match hyper.js internal regex: [a-z0-9]([-a-z0-9]*[a-z0-9])?


        //TODO: setup aws logging to cloudwatch.
        var createContainerOpts = {
            Image: project.Settings.dockerImage,
            name: container_name,
            Env: [],
            Cmd: ["capsulecd", "start", "--source", event.path.serviceType, "--package_type", project.Settings.packageType],
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
        createContainerOpts.Env.push("CAPSULE_RUNNER_PULL_REQUEST=" +event.path.prNumber);
        createContainerOpts.Env.push("CAPSULE_RUNNER_REPO_FULL_NAME="+project.OrgId + '/' + project.RepoId);
        createContainerOpts.Env.push("CAPSULE_ENGINE_VERSION_BUMP_TYPE=" + (event.body.versionIncr || 'patch'));

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

    logs: function(project_data, event){
        var hyper = new Hyper();
        var logs_deferred = q.defer();
        var container = hyper.getContainer(project_data.project.Pending[event.path.prNumber])



        //event.since is a UNIX timestamp in seconds (not milliseconds)

        //1. check if the container is already dead.
        container.inspect(function (err, inspectData) {
            if(err) return logs_deferred.reject(err);

            var logsResponse = {
                State: inspectData.State,
                Lines: []
            }


            if(event.query.since && !inspectData.State.Running && (Date.parse(inspectData.State.FinishedAt) /1000) < parseInt(event.query.since)){
                return logs_deferred.resolve(logsResponse) //empty array because no container logs will be found after this time.
            }

            var logs_settings = {
                stderr:true,
                stdout: true
            }

            if(event.query.since){
                logs_settings.since = event.query.since
            }

            container.logs(logs_settings, function(err, stream){
                if (err)  return logs_deferred.reject(err);

                const chunks = [];
                stream.on("data", function (chunk) {
                    chunks.push(chunk);
                });
                // Send the buffer or you can put it into a var
                stream.on("end", function () {
                    logsResponse.Lines = cleanLogs(Buffer.concat(chunks).toString())
                    logs_deferred.resolve(logsResponse);
                });

            })

        });

        return logs_deferred.promise


    },
    sign: function(project_data,event){
        //generate the url from the modem & _config options

        var request_url = url.format({
                protocol: 'https',
                slashes: true,
                hostname: 'us-west-1.hyper.sh'
                // pathname: options.path // this will incorrectly encode the '?' character.
            }) + '/v1.23/containers/'+project_data.project.Pending[event.path.prNumber]+'/logs?stream=true&follow=1&stderr=1&stdout=1&tail=1';

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
