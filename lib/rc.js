'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var cjson = require('cjson');
var fs = require('fs');
var path = require('path');

var detectProjectRoot = require('./detectProjectRoot');
var fsutils = require('./fsutils');
var utils = require('./utils');

var RC = function(rcpath, data) {
  this.path = rcpath;
  this.data = data || {};
};

RC.prototype = {
  set: function(key, value) {
    return _.set(this.data, key, value);
  },

  unset: function(key) {
    return _.unset(this.data, key);
  },

  get: function(key, fallback) {
    return _.get(this.data, key, fallback);
  },

  addProjectAlias: function(alias, project) {
    this.set(['projects', alias], project);
    return this.save();
  },

  removeProjectAlias: function(alias) {
    this.unset(['projects', alias]);
    return this.save();
  },

  get hasProjects() {
    return _.size(this.data.projects) > 0;
  },

  get projects() {
    return this.get('projects', {});
  },

  /**
   * Persists the RC file to disk, or returns false if no path on the instance.
   */
  save: function() {
    if (this.path) {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), {encoding: 'utf8'});
      return true;
    }
    return false;
  }
};

RC.loadFile = function(rcpath) {
  var data = {};
  if (fsutils.fileExistsSync(rcpath)) {
    try {
      data = cjson.load(rcpath);
    } catch (e) {
      // malformed rc file is a warning, not an error
      utils.logWarning('JSON error trying to load ' + chalk.bold(rcpath));
    }
  }
  return new RC(rcpath, data);
};

RC.load = function(cwd) {
  cwd = cwd || process.cwd();
  var dir = detectProjectRoot(cwd);
  var potential = path.resolve(dir || cwd, './.firebaserc');
  return RC.loadFile(potential);
};

module.exports = RC;
