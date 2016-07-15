var fs = require('fs');
var q = require('q');
var security = require('../security');

function getFiles (dir, files_){
    files_ = files_ || [];
    var files = fs.readdirSync(dir);
    for (var i in files){
        var name = dir + '/' + files[i];
        if (fs.statSync(name).isDirectory()){
            getFiles(name, files_);
        } else {
            files_.push(name);
        }
    }
    return files_;
}

function configureHyper(access_key, secret_key){
    var deferred = q.defer();

    var exec = require('child_process').exec;
    exec("./binaries/hyper config --accesskey "+access_key + " --secretkey "+ secret_key, {env:{'HOME':'/tmp'}}, function(error, stdout, stderr) {
        var data = {
            'stdout': stdout,
            'stderr': stderr
        };
        if (error !== null) {
            data['error'] = error;
            return deferred.reject(data);
        }
        return deferred.resolve(data);
    });
    return deferred.promise
}


function executeHyper(args){
    var deferred = q.defer();

    var exec = require('child_process').exec;
    exec("./binaries/hyper " + args.join(' '), {env:{'HOME':'/tmp'}}, function(error, stdout, stderr) {
        var data = {
            'stdout': stdout,
            'stderr': stderr
        };
        if (error !== null) {
            data['error'] = error;
            return deferred.reject(data);
        }
        return deferred.resolve(data);
    });
    return deferred.promise
}

module.exports = function(project_data,event) {
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
        env_vars.push(key + '=' + decrypted_value);
    }
    //set values here
    env_vars.push("CAPSULE_RUNNER_PULL_REQUEST=" +event.prNumber);
    env_vars.push("CAPSULE_RUNNER_REPO_FULL_NAME="+project.OrgId + '/' + project.RepoId);
    //access token is unique for each user
    env_vars.push("CAPSULE_SOURCE_GITHUB_ACCESS_TOKEN="+token);



    fs.writeFileSync('/tmp/capsule.env', env_vars.join("\n"), 'utf8');

    return configureHyper(process.env.HYPER_ACCESS_KEY, process.env.HYPER_SECRET_KEY)
        .then(function(config_response){
            // return executeHyper(['version'])
            return executeHyper([
                'run',
                // docker/hyper cli options
                '-d',
                '--env-file',
                '/tmp/capsule.env',
                '--name',
                date_prefix + '-' + event.serviceType + '-' + event.orgId + '-' + event.repoId + '-' + event.prNumber,
                // docker image
                project.Settings.dockerImage,
                //image command
                "capsulecd", "start", "--source", event.serviceType, "--package_type", project.Settings.packageType])
        })
}