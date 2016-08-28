var fs = require('fs');
var q = require('q');

module.exports = function(event, cb) {
    var payload = {
        'apiSha1': process.env.API_SHA1,
        //'files': getFiles('.'),
        'event': event
    }
    return cb(null, payload);
}