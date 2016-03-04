/**
 * Lib Router
 */

module.exports = {
  test: function(event, cb) {
    return cb(null, event);
  },

  connect: require('./controllers/connect'),
  callback: require('./controllers/callback'),
  hook: require('./controllers/hook'),

  //Authenticated Controllers (requires JWT Header)
  fetch: require('./controllers/fetch'),
  project: require('./controllers/project').router,
  project_process: require('./controllers/project_process')

};
//
//
//module.exports.
//
//
//// Single - All
//module.exports.singleAll = function(event, cb) {
//
//  var response = {
//    message: 'Your Serverless function ran successfully via the \''
//    + event.httpMethod
//    + '\' method!'
//  };
//
//  return cb(null, response);
//};
//
//// Multi - Create
//module.exports.multiCreate = function(event, cb) {
//
//  var response = {
//    message: 'Your Serverless function \'multi/create\' ran successfully!'
//  };
//
//  return cb(null, response);
//};
//
//// Multi - Show
//module.exports.multiShow = function(event, cb) {
//
//  var response = {
//    message: 'Your Serverless function \'multi/show\' ran successfully with the following ID \'' + event.pathId + '\'!'
//  };
//
//  return cb(null, response);
//};