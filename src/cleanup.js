'use strict';
require('dotenv').config();

var Helpers = require('./common/helpers');
var engine = require('./engines/hyper')
module.exports.index = (event, context, callback) => {
    return engine.cleanupContainers()
        .then(function(){
            callback(null, 'cleanup finished successfully');
        })
        .fail(Helpers.errorHandler(callback))



    // Use this code if you don't use the http event with the LAMBDA-PROXY integration
    // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
