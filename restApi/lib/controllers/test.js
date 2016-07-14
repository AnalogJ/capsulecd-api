var fs = require('fs');
var q = require('q');

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
    exec("./binaries/hyper config --accesskey "+access_key + " --secretkey "+ secret_key , function(error, stdout, stderr) {
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
    exec("./binaries/hyper " + args.join(' ') , function(error, stdout, stderr) {
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

module.exports = function(event, cb) {
    var payload = {
        'apiSha1': process.env.API_SHA1,
        //'files': getFiles('.'),
        'event': event
    }

    configureHyper(process.env.HYPER_ACCESS_KEY, process.env.HYPER_SECRET_KEY)
        .then(function(config_response){
            return executeHyper(['version'])

        })
        .then(function(exec_response){
            payload['exec_response'] = exec_response;
            return cb(null, payload);
        })
        .fail(function(err){
            payload['error'] = err;
            return cb(null, payload)
        })




}