module.exports = {
    //this is the api endpoint for application once its been uploaded to lambda
    //if stage is pointing to the master branch, this is V1, else, its the beta version of the api.
    'lambda_endpoint': 'https://api.capsulecd.com/'+ (process.env.STAGE=='master' ? 'v1' : process.env.STAGE),
    'web_endpoint': 'http://www.capsulecd.com',
    'capsulecd_username': 'CapsuleCD'
}