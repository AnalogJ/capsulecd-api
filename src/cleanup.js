'use strict';
var nconf = require('./common/nconf');

var Helpers = require('./common/helpers');
var engine = require('./engines/fargate')
module.exports.index = (event, context, callback) => {

    //TOOD: lots of cleanup tasks below:

    //cleanup old containers
    //cleanup old logs
    //cleanup old versions of tasks
    //cleanup old versionf of deployments? (should be done by serverless)


    return engine.cleanupContainers()
        .then(function(){
            callback(null, 'cleanup finished successfully');
        })
        .fail(Helpers.errorHandler(callback))



    // Use this code if you don't use the http event with the LAMBDA-PROXY integration
    // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
