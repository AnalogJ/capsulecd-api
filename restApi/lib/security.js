// Part of https://github.com/chris-rock/node-crypto-examples
// From http://lollyrock.com/articles/nodejs-encryption/

// Nodejs encryption with CTR
var crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    passphrase = 'd6F3Efeq';

module.exports = {
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
    }
};



