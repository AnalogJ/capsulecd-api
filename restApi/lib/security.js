// Part of https://github.com/chris-rock/node-crypto-examples
// From http://lollyrock.com/articles/nodejs-encryption/

// Nodejs encryption with CTR
var crypto = require('crypto'),
    q = require('q'),
    algorithm = 'aes-256-ctr',
    passphrase = process.env.ENCRYPTION_PASSPHRASE,
    jwt = require('jsonwebtoken'),
    jwt_passphrase = process.env.ENCRYPTION_JWT_PASSPHRASE

module.exports = {
    //API Token encryption/decryption
    encrypt: function (text){
        var cipher = crypto.createCipher(algorithm,passphrase)
        var crypted = cipher.update(text,'utf8','hex')
        crypted += cipher.final('hex');
        return crypted;
    },
    decrypt: function (text){
        var decipher = crypto.createDecipher(algorithm,passphrase)
        var dec = decipher.update(text,'hex','utf8')
        dec += decipher.final('utf8');
        return dec;
    },

    //JWT methods

    sign_token: function(payload){
        //TODO: put a reasonable expiry date here, 24h? 48?
        var deferred = q.defer();
        jwt.sign(payload, jwt_passphrase,{}, function(token) {
            return deferred.resolve(token);
        });
        return deferred.promise
    },
    verify_token: function(token){
        var deferred = q.defer();
        jwt.verify(token, jwt_passphrase, function(err, decoded) {
            if (err) return deferred.reject(err);
            return deferred.resolve(decoded);
        });
        return deferred.promise
    }
};



