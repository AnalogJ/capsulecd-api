var fs = require('fs');

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

module.exports = function(event, cb) {
    var payload = {
        'apiSha1': process.env.API_SHA1,
        //'files': getFiles('.'),
        'event': event
    }


    var exec = require('child_process').exec;
    exec("./binaries/hyper version", function(error, stdout, stderr) {
        // console.log('stdout: ', stdout);
        // console.log('stderr: ', stderr);
        // if (error !== null) {
        //     console.log('exec error: ', error);
        // }
        payload['stddout'] = stdout;
        payload['stderr'] = stderr
        if (error !== null) {
            payload['error'] = error;
        }
        return cb(null, payload);

    });

}