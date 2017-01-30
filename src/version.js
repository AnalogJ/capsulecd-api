'use strict';
require('dotenv').config();

module.exports.handler = (event, context, callback) => {

    var versionInfo = {
        'deploySha': process.env.DEPLOY_SHA
    }

    return callback(null, versionInfo);

    // Use this code if you don't use the http event with the LAMBDA-PROXY integration
    // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
