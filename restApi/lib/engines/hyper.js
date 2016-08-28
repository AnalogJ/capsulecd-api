var fs = require('fs');
var q = require('q');
var security = require('../security');
var hyper = require('hyper.js');

module.exports = {
    start: function(project_data,event){
        var project = project_data.project;
        var token = project_data.token;

        var date_prefix = new Date().toISOString()
            .replace(/T/, '-')      // replace T with a space
            .replace(/\..+/, '')     // delete the dot and everything after
            .replace(/:/g,'-');

        //TODO: setup aws logging to cloudwatch.
        var createContainerOpts = {
            Image: project.Settings.dockerImage,
            name: date_prefix + '-' + event.serviceType + '-' + event.orgId + '-' + event.repoId + '-' + event.prNumber,
            Env: [],
            Cmd: ["capsulecd", "start", "--source", event.serviceType, "--package_type", project.Settings.packageType],
            Labels: {
                "sh_hyper_instancetype": "s1"
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
        //access token is unique for each user
        createContainerOpts.Env.push("CAPSULE_SOURCE_GITHUB_ACCESS_TOKEN="+token);



        //create a new container on Hyper
        var hyper = new Hyper();
        var service_deferred = q.defer();
        hyper.createContainer(createContainerOpts, function (err, container) {
            if (err)  return service_deferred.reject(err);
            container.start(function (err, data) {
                if (err)  return service_deferred.reject(err);
                return service_deferred.resolve(data);
            });
        });
    }
    //TODO: pull the image when the project is created.
    //TODO: add a timed task to pull the lastest image for all containers, every 1 hour?
    // pullImage: function(){
    //     hyper.pull('analogj/capsulecd', function (err, stream) {
    //         // console.log(stream)
    //     });
    // }
}
