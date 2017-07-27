var fs = require('fs');
var q = require('q');
var security = require('../common/security');
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
            .replace(/[^a-z0-9]/gmi, " ").replace(/\s+/g, "-") // makesure we match hyper.js internal regex: [a-z0-9]([-a-z0-9]*[a-z0-9])?
            .substring(0,48)//hyper doesnt like it if the container name is too long.
            .replace(/-$/, '') //hyper doesnt like it if the last character is a '-'

        //TODO: setup aws logging to cloudwatch.
        var createContainerOpts = {
            Image: project.Settings.dockerImage,
            name: container_name,
            Env: [],
            Cmd: ["capsulecd", "start", "--scm", event.path.serviceType, "--package_type", project.Settings.packageType],
            Labels: {
                "sh_hyper_instancetype": "s4"
            }
        };

        //loop through secrets, decrypt and set on the container options Env.
        var keys = Object.keys(project.Secrets);
        for(var ndx in keys){
            var key = keys[ndx];
            if(key == 'CAPSULE_SCM_PULL_REQUEST' || key == 'CAPSULE_SCM_REPO_FULL_NAME'){ continue; }
            var decrypted_value = security.decrypt(project.Secrets[key].enc_value);
            createContainerOpts.Env.push(key + '=' + decrypted_value);
        }
        //set values here
        createContainerOpts.Env.push("CAPSULE_SCM_PULL_REQUEST=" +event.path.prNumber);
        createContainerOpts.Env.push("CAPSULE_SCM_REPO_FULL_NAME="+project.OrgId + '/' + project.RepoId);
        createContainerOpts.Env.push("CAPSULE_ENGINE_VERSION_BUMP_TYPE=" + (event.body.versionIncr || 'patch'));

        //access token is unique for each user
        createContainerOpts.Env.push("CAPSULE_SCM_GITHUB_ACCESS_TOKEN="+token);

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
    cleanupContainers: function(){

        var hyper = new Hyper();
        var cleanup_deferred = q.defer();


        function cleanupContainer(hyper, containerInfo){

            var container_deferred = q.defer();
            console.log("Cleaning up: " + containerInfo.Names[0])
            var container = hyper.getContainer(containerInfo.Id);
            container.stop(function(){
                container.remove({force:true, v: true},function(remove_err, remove_data){
                    if(remove_err){ return container_deferred.reject(remove_err)}
                    return container_deferred.resolve(remove_data)
                })
            })

            return container_deferred.promise
        }


        //list all containers,
        // find all containers which are more than 30 minutes old
        hyper.listContainers({all: true},function (err, containers) {
            if(err){
                return console.log(err)
            }
            //filter all containers older than 30 minutes
            var timestamp_now = Math.round((+ new Date())/1000) - (60*30)
            containers = containers.filter(function(containerInfo){
                return containerInfo.Created < timestamp_now
            })


            return cleanup_deferred.resolve(containers)
        });

        return cleanup_deferred.promise.then(function(containers){
            var cleanup_promises = containers.map(function(containerInfo){
                // stop all containers which running and pass filter condition.
                // remove all containers
                return cleanupContainer(hyper, containerInfo)
            })

            return q.allSettled(cleanup_promises)
        })
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
