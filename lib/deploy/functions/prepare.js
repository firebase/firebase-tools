'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var resolveProjectPath = require('../../resolveProjectPath');
var fs = require('fs');
var utils = require('../../utils');

var VALID_FUNCTION_NAME_REGEX = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/;

module.exports = function(context, options, payload) {

  payload.functions = options.config.get('functions');

  if (payload.functions) {
    if (!_.has(payload.functions, '.source')) {
      return utils.reject('No .source directory specified under "functions", can\'t deploy Google Cloud Functions', {exit: 1});
    } else if (!fs.existsSync(resolveProjectPath(options.cwd, payload.functions['.source']))) {
      return utils.reject('Specified .source directory specified under "functions" does not exist, can\'t deploy Google Cloud Functions', {exit: 1});
    }

    // Function name validation
    var invalidNames = _.chain(_.keys(payload.functions))
      .reject(function(name) {
        return _.startsWith(name, '.');
      })
      .reject(function(name) {
        return VALID_FUNCTION_NAME_REGEX.exec(name);
      }).value();
    if (!_.isEmpty(invalidNames)) {
      return utils.reject(invalidNames.join(', ') + ' function name(s) must be a valid subdomain (lowercase letters, numbers and dashes)', {exit: 1});
    }
  }

  return RSVP.resolve();
};
