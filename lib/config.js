'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var cjson = require('cjson');
var fs = require('fs-extra');
var path = require('path');
var RSVP = require('rsvp');

var detectProjectRoot = require('./detectProjectRoot');
var FirebaseError = require('./error');
var fsutils = require('./fsutils');
var loadCJSON = require('./loadCJSON');
var parseBoltRules = require('./parseBoltRules');
var prompt = require('./prompt');
var resolveProjectPath = require('./resolveProjectPath');
var utils = require('./utils');
var validateJsonRules = require('./validateJsonRules');
var logger = require('./logger');

var Config = function(src, options) {
  this.options = options || {};
  this.projectDir = options.projectDir || detectProjectRoot(options.cwd);

  this._src = src;
  this.data = {};
  this.defaults = {};
  this.notes = {};

  if (this._src.firebase) {
    this.defaults.project = this._src.firebase;
    utils.logWarning(chalk.bold('"firebase"') + ' key in firebase.json is deprecated. Run ' + chalk.bold('firebase use --add') + ' instead');
  }

  if (_.has(this._src, 'rules')) {
    _.set(this._src, 'database.rules', this._src.rules);
  }

  Config.MATERIALIZE_TARGETS.forEach(function(target) {
    if (_.get(this._src, target)) {
      if (target === 'database.rules') {
        _.set(this.data, 'database.rulesString', this._materialize(target));
      } else {
        _.set(this.data, target, this._materialize(target));
      }
    }
  }, this);

  // auto-detect functions from package.json in directory
  if (this.projectDir && !this.get('functions.source') && fsutils.fileExistsSync(this.path('functions/package.json'))) {
    this.set('functions.source', 'functions');
  }

  // use 'public' as signal for legacy hosting since it's a required key
  if (!this.data.hosting && this._src.public) {
    this.importLegacyHostingKeys();
  }
};

Config.FILENAME = 'firebase.json';
Config.MATERIALIZE_TARGETS = ['functions', 'hosting', 'database.rules', 'storage'];
Config.LEGACY_HOSTING_KEYS = ['public', 'rewrites', 'redirects', 'headers', 'ignore', 'cleanUrls', 'trailingSlash'];

Config.prototype.importLegacyHostingKeys = function() {
  var found = false;
  Config.LEGACY_HOSTING_KEYS.forEach(function(key) {
    if (_.has(this._src, key)) {
      found = true;
      this.set('hosting.' + key, this._src[key]);
    }
  }, this);
  if (found) {
    utils.logWarning('Deprecation Warning: Firebase Hosting configuration should be moved under "hosting" key.');
  }
};

Config.prototype._hasDeepKey = function(obj, key) {
  if (_.has(obj, key)) {
    return true;
  }

  for (var k in obj) {
    if (_.isPlainObject(obj[k]) && this._hasDeepKey(obj[k], key)) {
      return true;
    }
  }
  return false;
};

Config.prototype._materialize = function(target) {
  var val = _.get(this._src, target);
  if (_.isString(val)) {
    var out = this._parseFile(target, val);
    // if e.g. rules.json has {"rules": {}} use that
    var lastSegment = _.last(target.split('.'));
    if (_.size(out) === 1 && _.has(out, lastSegment)) {
      out = out[lastSegment];
    }
    return out;
  } else if (_.isObject(val)) {
    if (target === 'database.rules') {
      this.notes.databaseRules = 'inline';
    }
    return val;
  }

  throw new FirebaseError('Parse Error: "' + target + '" must be object or import path', {exit: 1});
};

Config.prototype._parseFile = function(target, filePath) {
  var fullPath = resolveProjectPath(this.options.cwd, filePath);
  var ext = path.extname(filePath);
  if (!fsutils.fileExistsSync(fullPath)) {
    throw new FirebaseError('Parse Error: Imported file ' + filePath + ' does not exist', {exit: 1});
  }

  switch (ext) {
  case '.json':
    if (target === 'database') {
      this.notes.databaseRules = 'json';
    } else if (target === 'database.rules') {
      var rules = fs.readFileSync(fullPath, 'utf8');
      if (validateJsonRules(rules)) {
        return rules;
      }
      utils.logWarning(chalk.bold.yellow('database: ') + chalk.bold(filePath) + ' must have an outer ' + chalk.bold('rules') + ' key, for example:');
      logger.warn('\n{\n\t"rules": {".read": false, ".write": false}\n}');
      throw new FirebaseError('Database security rules are not correctly formatted', {exit: 1});
    }
    return loadCJSON(fullPath);
  /* istanbul ignore-next */
  case '.bolt':
    if (target === 'database') {
      this.notes.databaseRules = 'bolt';
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
  if (_.includes(path.relative(this.projectDir, outPath), '..')) {
    throw new FirebaseError(chalk.bold(pathName) + ' is outside of project directory', {exit: 1});
  }
  return outPath;
};

Config.prototype.readProjectFile = function(p, options) {
  try {
    var content = fs.readFileSync(this.path(p), 'utf8');
    if (options.json) {
      return JSON.parse(content);
    }
    return content;
  } catch (e) {
    if (options.fallback) {
      return options.fallback;
    }
    throw e;
  }
};

Config.prototype.writeProjectFile = function(p, content) {
  if (typeof content !== 'string') {
    content = JSON.stringify(content, null, 2) + '\n';
  }

  fs.ensureFileSync(this.path(p));
  fs.writeFileSync(this.path(p), content, 'utf8');
};

Config.prototype.askWriteProjectFile = function(p, content) {
  var writeTo = this.path(p);
  var next;
  if (fsutils.fileExistsSync(writeTo)) {
    next = prompt.once({
      type: 'confirm',
      message: 'File ' + chalk.underline(p) + ' already exists. Overwrite?',
      default: false
    });
  } else {
    next = RSVP.resolve(true);
  }

  var self = this;
  return next.then(function(result) {
    if (result) {
      self.writeProjectFile(p, content);
      utils.logSuccess('Wrote ' + chalk.bold(p));
    } else {
      utils.logBullet('Skipping write of ' + chalk.bold(p));
    }
  });
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
