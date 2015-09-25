'use strict';

var FirebaseError = require('./error');
var detectProjectRoot = require('./detectProjectRoot');
var cjson = require('cjson');
var loadConfig = require('./loadConfig');
var resolveProjectPath = require('./resolveProjectPath');
var chalk = require('chalk');

module.exports = function(options) {
  var config = loadConfig(options);
  if (!config.rules) {
    return null;
  }

  options = options || {};
  /* istanbul ignore next */
  var pd = detectProjectRoot(options.cwd);
  if (pd) {
    try {
      var rules = cjson.load(resolveProjectPath(options.cwd, config.rules));
      return rules;
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new FirebaseError('Could not find rules file ' + chalk.bold(config.rules), {
          exit: 1
        });
      }
      throw new FirebaseError('There was an error parsing your rules file (' + config.rules + '):\n\n' + e.message, {
        exit: 1
      });
    }
  }
};
