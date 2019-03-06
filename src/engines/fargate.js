var fs = require('fs');
var q = require('q');
var security = require('../common/security');
var AWS = require("aws-sdk");
AWS.config.apiVersions = {
    ecs: '2014-11-13',
    cloudwatchlogs: '2014-03-28'
    // other service API versions
};
var ecs = new AWS.ECS();
var cloudwatchlogs = new AWS.CloudWatchLogs();

//https://www.prodops.io/blog/deploying-fargate-services-using-cloudformation
//https://github.com/docker/docker/issues/7375
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ECS.html#registerTaskDefinition-property


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
                name: 'capsulecd',
                //command must be overriden by the taskRun command
                command: [
                    "capsulecd",
                    "start",
                    "--package_type",
                    project.Settings.packageType
                ],
                environment: [],
                essential: true,
                image: project.Settings.dockerImage,
                cpu: 512,
                memory: 1024,
                logConfiguration: {
                    logDriver: 'awslogs', /* required */
                    options: {
                        'awslogs-create-group': 'true',
                        'awslogs-region': 'us-east-1',
                        'awslogs-group': `/aws/ecs/capsulecd-api-${nconf.get('STAGE')}-tasks`,
                        'awslogs-stream-prefix': project.Settings.packageType
                    }
                },
            }
        ],

        family: `capsulecd-${project.Settings.packageType}`,
        executionRoleArn: `arn:aws:iam::450541372000:role/capsulecd-api-${nconf.get('STAGE')}-ecsExecutionRole`,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: "512",
        memory: "1024",
        volumes: []
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
            //TODO: requires extended tag format for
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
            },
            {
                key: "CAPSULE_START_DATE",
                value: new Date().toISOString()
            },
            {
                key: "CAPSULE_PACKAGE_TYPE",
                value: project.Settings.packageType
            }
        ],
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets: [
                    "subnet-afea3085"
                ],
                assignPublicIp: "ENABLED",
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'capsulecd',
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
        console.log(data)
        return run_deferred.resolve(data)
    });

    return run_deferred.promise
}


function getTaskStatus(taskId){
    var deferred = q.defer();

    var params = {
        tasks: [ taskId ]
    };

    ecs.describeTasks(params, function(err, data) {
        if (err)  return deferred.reject(err);
        console.log(data)
        return deferred.resolve(data.tasks[0].lastStatus)
    });

    return deferred.promise
}

function getTaskLogs(project_data, taskId, nextToken){
    var deferred = q.defer();


    var params = {
        logGroupName: `/aws/ecs/capsulecd-api-${nconf.get('STAGE')}-tasks`,
        logStreamName: `${project_data.project.Settings.packageType}/capsulecd/${taskId}`, /* required */
        // endTime: 0,
        // limit: 0,
        // nextToken: 'STRING_VALUE',
        // startFromHead: true || false,
        // startTime: 0
    };

    //TODO: get updated status for deployment.
    var logsResponse = {
        State: 'RUNNING',
        Lines: [],
        NextToken: null
    }

    if(nextToken){
        params.nextToken = nextToken
    }

    cloudwatchlogs.getLogEvents(params, function(err, data) {
        if (err) return deferred.reject(err, err.stack); // an error occurred
        console.log(data);           // successful response

        //if next and current are the same, set next to null (ignore)
        if(nextToken != data.nextForwardToken){
            logsResponse.NextToken = data.nextForwardToken
        }

        for(var ndx in data.events){
            var event = data.events[ndx]

            logsResponse.Lines.push({
                stream: 'stdout', //TODO: not sure how to differentiate between stdout and stderr.
                line: event.message
            })
        }

        return deferred.resolve(logsResponse);
    });

    return deferred.promise
}

module.exports = {
    start: function(project_data,event){
        return registerTaskDefinition(project_data, event)
            .then(function(taskDefinitionData){
                return runTaskDefinition(taskDefinitionData, project_data, event)
            })
            .then(function(runTaskData){
                //find the taskId (which can be used to determine the cloudwatch stream)
                //taskArn: 'arn:aws:ecs:us-east-1:XXXXXX:task/default/d5313978aXXXXXXX9467699979e2',
                var taskId = runTaskData.tasks[0].taskArn.split(':').pop().split('/').pop();
                return {
                    streamId: `${project_data.project.Settings.packageType}/capsulecd/${taskId}`,
                    taskId: taskId
                }
            })
    },
    //TODO: add a timed task to pull the lastest image for all containers, every 1 hour?
    pullImage: function(dockerImage){
        //pulling a image is a noop in AWS Fargate
        return q.resolve({})
    },

    logs: function(project_data, event){
        var taskId = project_data.project.Pending[event.path.prNumber]

        //check if there's a NextToken specified.
        //  if no NextToken found, check the status of the container, check if its running yet.
        //      if container is running (or finished)
        //          return the current logs (and NextToken)
        //      else if container is not running (STARTING?)
        //          return empty (UI should retry after delay)
        //  else
        //      return the logs


        if(event.query.NextToken){
            return getTaskLogs(project_data, taskId, event.query.NextToken)
        }
        else {
            return getTaskStatus(taskId)
                .then(function(status){
                    if((status == "RUNNING") || (status == "STOPPED")){
                        return getTaskLogs(project_data, taskId, null)
                    }
                    else {
                        //container is pending.

                        return {
                            State: status,
                            Lines: [],
                            NextToken: null
                        }
                    }
                })
        }
    },
    cleanupContainers: function(){

        //cleaning containers is a noop in AWS Fargate
        return q.resolve({})
    },


    sign: function(project_data,event){

        return {}

    }
}
