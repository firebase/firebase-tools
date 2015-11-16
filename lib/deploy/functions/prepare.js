'use strict';

var _ = require('lodash');
var cjson = require('cjson');
var fs = require('fs');
var path = require('path');
var resolveProjectPath = require('../../resolveProjectPath');
var RSVP = require('rsvp');
var utils = require('../../utils');

var VALID_FUNCTION_NAME_REGEX = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/;

module.exports = function(context, options, payload) {

  payload.functions = options.config.get('functions');

  if (payload.functions) {
    if (!_.has(payload.functions, '.source')) {
      return utils.reject('No .source directory specified under "functions", can\'t deploy Google Cloud Functions', {exit: 1});
    } else if (!fs.existsSync(resolveProjectPath(options.cwd, payload.functions['.source']))) {
      return utils.reject('.source directory specified under "functions" does not exist, can\'t deploy Google Cloud Functions', {exit: 1});
    }

    // Function name validation
    var invalidNames = _.reject(_.keys(payload.functions), function(name) {
      return _.startsWith(name, '.') || VALID_FUNCTION_NAME_REGEX.test(name);
    });
    if (!_.isEmpty(invalidNames)) {
      return utils.reject(invalidNames.join(', ') + ' function name(s) must be a valid subdomain (lowercase letters, numbers and dashes)', {exit: 1});
    }

    // Check main file specified in package.json is present
    var sourceDir = options.config.path(payload.functions['.source']);
    var packageJsonFile = path.join(sourceDir, 'package.json');
    if (fs.existsSync(packageJsonFile)) {
      try {
        var data = cjson.load(packageJsonFile);
        var indexJsFile = path.join(sourceDir, data.main || 'index.js');
        if (!fs.existsSync(indexJsFile)) {
          return utils.reject(path.relative(options.config.projectDir, indexJsFile) + ' does not exist, can\'t deploy Google Cloud Functions', {exit: 1});
        }
      } catch (e) {
        return utils.reject('There was an error reading ' + payload.functions['.source'] + path.sep + 'package.json:\n\n' + e.message, {exit: 1});
      }
    }
  }

  return RSVP.resolve();
};
