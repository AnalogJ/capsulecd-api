module.exports = {


    /*
    * Error handler can be used as follows:
    * var Helpers = require('../helpers');
    * Helpers.errorHandler(cb)(err)
    * or
    * Promise.fail(Helpers.errorHandler(cb))
    *
    * */
    errorHandler: function(cb){
        var _cb = cb;
        return function(err){
            if (typeof err === 'string'){
                //this is a string error message, wrap it in an error obj
                err = new Error(err)
            }
            else if(!err instanceof Error){
                //this is an object or something other than an error obj
                //do nothing for now.
            }

            if(!err.status){
                err.code = 400;
            }

            var whitelisted_props = Object.getOwnPropertyNames(err)
            if (process.env.SERVERLESS_STAGE != 'dev'){
                whitelisted_props = ["message","status"]
            }

            return _cb(JSON.stringify(err, whitelisted_props),null);
        }
    }
}