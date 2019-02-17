var fs = require('fs');
var q = require('q');
var security = require('../common/security');
var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    ecs: '2014-11-13',
    // other service API versions
};
var ecs = new AWS.ECS();



var url = require('url');
var nconf = require('../common/nconf');

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



// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#registerTaskDefinition-property
function registerTaskDefinition(project_data,event){
    var register_deferred = q.defer();

    var project = project_data.project;

    //there are 2 stages to creating a fargate task
    // 1. register a task definition
    // 2. run the task definition with overrides (env vars)


    var params = {
        containerDefinitions: [
            {
                name: `tmpl-capsulecd--${project.Settings.packageType}`,
                //command must be overriden by the taskRun command
                command: [
                    "capsulecd",
                    "start",
                    "--package_type",
                    project.Settings.packageType
                ],
                environment: [],
                cpu: 0,
                essential: true,
                image: project.Settings.dockerImage,
                memory: 512
            }
        ],

        family: `capsulecd-${project.Settings.packageType}`,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        volumes: [],
        tags: [
            {
                key: "CAPSULE_PACKAGE_TYPE",
                value: project.Settings.packageType
            }
        ],
    };
    ecs.registerTaskDefinition(params, function(err, data) {
        if (err)  return register_deferred.reject(err);
        return register_deferred.resolve(data)
    });
    return register_deferred.promise
}

function runTaskDefinition(taskDefData,project_data,event) {
    var run_deferred = q.defer();

    var project = project_data.project;
    var token = project_data.token;
    var username = project_data.username;


    var date_prefix = new Date().toISOString()
        .replace(/T/, '-')      // replace T with a space
        .replace(/\..+/, '')     // delete the dot and everything after
        .replace(/:/g,'-');

    var container_name = (date_prefix + '-' + event.path.serviceType + '-' + event.path.orgId + '-' + event.path.repoId + '-' + event.path.prNumber)
        .toLowerCase() //all chars should be lowercase
        .replace(/[^a-z0-9]/gmi, " ").replace(/\s+/g, "-") // makesure we match hyper.js internal regex: [a-z0-9]([-a-z0-9]*[a-z0-9])?
        .substring(0,48)//hyper doesnt like it if the container name is too long.
        .replace(/-$/, '') //hyper doesnt like it if the last character is a '-'


    var env = []

    //loop through secrets, decrypt and set on the container options Env.
    var keys = Object.keys(project.Secrets);
    for(var ndx in keys){
        var key = keys[ndx];
        if(key == 'CAPSULE_SCM_PULL_REQUEST' || key == 'CAPSULE_SCM_REPO_FULL_NAME'){ continue; }
        var decrypted_value = security.decrypt(project.Secrets[key].enc_value);
        env.push({
            name: key,
            value: decrypted_value
        });
    }
    //set values here
    env.push({
        name: "CAPSULE_SCM_PULL_REQUEST",
        value: event.path.prNumber
    });
    env.push({
        name: "CAPSULE_SCM_REPO_FULL_NAME",
        value: project.OrgId + '/' + project.RepoId
    });
    env.push({
        name: "CAPSULE_ENGINE_VERSION_BUMP_TYPE",
        value: (event.body.versionIncr || 'patch')
    });

    //access token is unique for each user
    env.push({
        name: `CAPSULE_SCM_${event.path.serviceType.toUpperCase()}_USERNAME`,
        value: username
    });
    env.push({
        name: `CAPSULE_SCM_${event.path.serviceType.toUpperCase()}_ACCESS_TOKEN`,
        value: token
    });


    var params = {
        cluster: "default",
        taskDefinition: "capsulecd-"+project.Settings.packageType,
        launchType: "FARGATE",
        tags: [
            {
                key: "CAPSULE_SCM",
                value: event.path.serviceType
            },
            {
                key: "CAPSULE_SCM_REPO_FULL_NAME",
                value: project.OrgId + '/' + project.RepoId
            },
            {
                key: "CAPSULE_SCM_PULL_REQUEST",
                value: event.path.prNumber
            },
            {
                key: "CAPSULE_ENGINE_VERSION_BUMP_TYPE",
                value: (event.body.versionIncr || 'patch')
            }
        ],
        propagateTags: true,
        overrides: {
            containerOverrides: [
                {
                    name: container_name,
                    environment: env,
                    command: [
                        "capsulecd",
                        "start",
                        "--scm",
                        event.path.serviceType,
                        "--package_type",
                        project.Settings.packageType
                    ]
                }
            ]
        }
    };

    ecs.runTask(params, function(err, data) {
        if (err)  return run_deferred.reject(err);
        return run_deferred.resolve(data)
    });

    return run_deferred.promise
}

module.exports = {
    start: function(project_data,event){
        return registerTaskDefinition(project_data, event)
            .then(function(taskDefinitionData){
                return runTaskDefinition(taskDefinitionData, project_data, event)
            })
            .then(function(runTaskData){
                return runTaskData.tasks[0].containers[0].containerArn
            })
    },
    //TODO: add a timed task to pull the lastest image for all containers, every 1 hour?
    pullImage: function(dockerImage){
        //pulling a image is a noop in AWS Fargate
        return q.resolve({})
    },

    logs: function(project_data, event){

        //pulling logs is currently a noop in AWS Fargate
        return q.resolve({})


    },
    cleanupContainers: function(){

        //cleaning containers is a noop in AWS Fargate
        return q.resolve({})
    },


    sign: function(project_data,event){

        return {}

    }
}
