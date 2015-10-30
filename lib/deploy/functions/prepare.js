'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var resolveProjectPath = require('../../resolveProjectPath');
var fs = require('fs');
var utils = require('../../utils');

module.exports = function(context, options, payload) {
  payload.functions = options.config.get('functions');

  if (payload.functions && _.has(payload, 'functions')) {
    if (!_.has(payload.functions, '.source')) {
      return utils.reject('No .source directory specified, can\'t deploy Google Cloud Functions', {exit: 1});
    } else if (!fs.existsSync(resolveProjectPath(options.cwd, payload.functions['.source']))) {
      return utils.reject('Specified .source directory does not exist, can\'t deploy Google Cloud Functions', {exit: 1});
    }
  }

  return RSVP.resolve();
};
