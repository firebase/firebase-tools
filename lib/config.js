'use strict';

var cjson = require('cjson');
var FirebaseError = require('./error');
var _ = require('lodash');
var resolveProjectPath = require('./resolveProjectPath');
var path = require('path');
var fs = require('fs');
var loadCJSON = require('./loadCJSON');
var parseBoltRules = require('./parseBoltRules');
var detectProjectRoot = require('./detectProjectRoot');
var chalk = require('chalk');

var Config = function(src, options) {
  this.options = options || {};
  this.projectDir = detectProjectRoot(options.cwd);

  this._src = src;
  this.data = {};
  this.defaults = {};
  this.notes = {};

  if (this._src.firebase) {
    this.defaults.project = this._src.firebase;
  }

  Config.TARGETS.forEach(function(target) {
    if (this._src[target]) {
      this.data[target] = this._materialize(target);
    }
  }, this);

  // use 'public' as signal for legacy hosting since it's a required key
  if (!this.data.hosting && this._src.public) {
    this.importLegacyKeys();
  }
};

Config.FILENAME = 'firebase.json';
Config.TARGETS = ['hosting', 'rules'];
Config.LEGACY_HOSTING_KEYS = ['public', 'rewrites', 'redirects', 'headers', 'ignore', 'cleanUrls', 'trailingSlash'];

Config.prototype.importLegacyKeys = function() {
  Config.LEGACY_HOSTING_KEYS.forEach(function(key) {
    if (_.has(this._src, key)) {
      this.set('hosting.' + key, this._src[key]);
    }
  }, this);
};

Config.prototype._materialize = function(target) {
  if (_.isString(this._src[target])) {
    var out = this._parseFile(target, this._src[target]);
    // if e.g. rules.json has {"rules": {}} use that
    if (_.size(out) === 1 && _.has(out, target)) {
      out = out[target];
    }
    return out;
  } else if (_.isObject(this._src[target])) {
    if (target === 'rules') {
      this.notes.rules = 'inline';
    }
    return this._src[target];
  }

  throw new FirebaseError('Parse Error: "' + target + '" must be object or import path', {exit: 1});
};

Config.prototype._parseFile = function(target, filePath) {
  var fullPath = resolveProjectPath(this.options.cwd, filePath);
  var ext = path.extname(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new FirebaseError('Parse Error: Imported file ' + filePath + ' does not exist', {exit: 1});
  }

  switch (ext) {
  case '.json':
    if (target === 'rules') {
      this.notes.rules = 'json';
    }
    var data = loadCJSON(fullPath);
    return data;
  /* istanbul ignore-next */
  case '.bolt':
    if (target === 'rules') {
      this.notes.rules = 'bolt';
    }
    return parseBoltRules(fullPath);
  default:
    throw new FirebaseError('Parse Error: ' + filePath + ' is not of a supported config file type', {exit: 1});
  }
};

Config.prototype.get = function(key, fallback) {
  return _.get(this.data, key, fallback);
};

Config.prototype.set = function(key, value) {
  return _.set(this.data, key, value);
};

Config.prototype.has = function(key) {
  return _.has(this.data, key);
};

Config.prototype.path = function(pathName) {
  var outPath = path.normalize(path.join(this.projectDir, pathName));
  if (_.contains(path.relative(this.projectDir, outPath), '..')) {
    throw new FirebaseError(chalk.bold(pathName) + ' is outside of project directory', {exit: 1});
  }
  return outPath;
};

Config.load = function(options, allowMissing) {
  var pd = detectProjectRoot(options.cwd);
  if (pd) {
    try {
      var data = cjson.load(path.join(pd, Config.FILENAME));
      return new Config(data, options);
    } catch (e) {
      throw new FirebaseError('There was an error loading firebase.json:\n\n' + e.message, {
        exit: 1
      });
    }
  }

  if (allowMissing) {
    return null;
  }

  throw new FirebaseError('Not in a Firebase app directory (could not locate firebase.json)', {exit: 1});
};

module.exports = Config;
