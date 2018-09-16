var nconf = require('nconf');
var path = require('path');
// Load from Environment Variables
nconf.env();

// Values in `default.json`
nconf.file(path.resolve(__dirname, '../environments/default.json'));

module.exports = nconf;