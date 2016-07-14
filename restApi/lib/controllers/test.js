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
        'files': getFiles('.'),
        'event': event
    }
    return cb(null, payload);
}