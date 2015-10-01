'use strict';

var FirebaseError = require('./error');
var detectProjectRoot = require('./detectProjectRoot');
var cjson = require('cjson');
var Config = require('./config');
var parseBoltRules = require('./parseBoltRules');
var resolveProjectPath = require('./resolveProjectPath');
var chalk = require('chalk');
var path = require('path');

module.exports = function(options) {
  var config = Config.load(options);
  if (!config.rules) {
    return null;
  }

  options = options || {};
  /* istanbul ignore next */
  var pd = detectProjectRoot(options.cwd);
  if (pd) {
    try {
      var rulesPath = resolveProjectPath(pd, config.rules);

      if (path.extname(rulesPath) === '.bolt') {
        return parseBoltRules(rulesPath);
      }

      var rules = cjson.load(rulesPath);
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
