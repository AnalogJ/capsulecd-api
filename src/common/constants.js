var nconf = require('./nconf');

module.exports = {
    //this is the api endpoint for application once its been uploaded to lambda
    //if stage is pointing to the master branch, this is V1, else, its the beta version of the api.
    'lambda_endpoint': 'https://api.capsulecd.com/'+ (nconf.get('STAGE') =='master' ? 'v1' : nconf.get('STAGE')),
    'web_endpoint': 'https://'+ (nconf.get('STAGE') =='master' ? 'www' : nconf.get('STAGE')) + '.capsulecd.com',
    'capsulecd_username': 'CapsuleCD',

    'projects_table': nconf.get('STAGE') + '-capsulecd-api-projects',
    'users_table': nconf.get('STAGE') + '-capsulecd-api-users'
}