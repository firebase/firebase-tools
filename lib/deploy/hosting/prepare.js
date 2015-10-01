'use strict';

var validator = require('../../validator').firebase;
var Config = require('../../config');
var utils = require('../../utils');
var chalk = require('chalk');

module.exports = function(context, options, payload) {
  var config = Config.load(options);
  context.hosting = {
    versionRef: options.firebaseRef.child('hosting/versions').child(context.firebase).push()
  };
  context.hosting.versionId = context.hosting.versionRef.key();

  return validator.validate(config).then(function() {
    utils.logSuccess('read config from ' + chalk.bold('firebase.json'));
    payload.config = config;
  });
};
