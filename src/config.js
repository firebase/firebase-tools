"use strict";

var _ = require("lodash");
var clc = require("cli-color");
var cjson = require("cjson");
var fs = require("fs-extra");
var path = require("path");

var detectProjectRoot = require("./detectProjectRoot").detectProjectRoot;
var { FirebaseError } = require("./error");
var fsutils = require("./fsutils");
var loadCJSON = require("./loadCJSON");
var parseBoltRules = require("./parseBoltRules");
var { promptOnce } = require("./prompt");
var { resolveProjectPath } = require("./projectPath");
var utils = require("./utils");

/**
 * @constructor
 * @this Config
 *
 * @param {*} src
 * @param {object=} options
 */
var Config = function (src, options) {
  this.options = options || {};
  this.projectDir = options.projectDir || detectProjectRoot(options);

  this._src = src;
  this.data = {};
  this.defaults = {};
  this.notes = {};

  if (this._src.firebase) {
    this.defaults.project = this._src.firebase;
    utils.logWarning(
      clc.bold('"firebase"') +
        " key in firebase.json is deprecated. Run " +
        clc.bold("firebase use --add") +
        " instead"
    );
  }

  if (_.has(this._src, "rules")) {
    _.set(this._src, "database.rules", this._src.rules);
  }

  Config.MATERIALIZE_TARGETS.forEach((target) => {
    if (_.get(this._src, target)) {
      _.set(this.data, target, this._materialize(target));
    }
  });

  // auto-detect functions from package.json in directory
  if (
    this.projectDir &&
    !this.get("functions.source") &&
    fsutils.fileExistsSync(this.path("functions/package.json"))
  ) {
    this.set("functions.source", "functions");
  }
};

Config.FILENAME = "firebase.json";
Config.MATERIALIZE_TARGETS = [
  "database",
  "emulators",
  "firestore",
  "functions",
  "hosting",
  "storage",
  "remoteconfig",
];

Config.prototype._hasDeepKey = function (obj, key) {
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

Config.prototype._materialize = function (target) {
  var val = _.get(this._src, target);
  if (_.isString(val)) {
    var out = this._parseFile(target, val);
    // if e.g. rules.json has {"rules": {}} use that
    var lastSegment = _.last(target.split("."));
    if (_.size(out) === 1 && _.has(out, lastSegment)) {
      out = out[lastSegment];
    }
    return out;
  } else if (_.isPlainObject(val) || _.isArray(val)) {
    return val;
  }

  throw new FirebaseError('Parse Error: "' + target + '" must be object or import path', {
    exit: 1,
  });
};

Config.prototype._parseFile = function (target, filePath) {
  var fullPath = resolveProjectPath(this.options, filePath);
  var ext = path.extname(filePath);
  if (!fsutils.fileExistsSync(fullPath)) {
    throw new FirebaseError("Parse Error: Imported file " + filePath + " does not exist", {
      exit: 1,
    });
  }

  switch (ext) {
    case ".json":
      if (target === "database") {
        this.notes.databaseRules = "json";
      } else if (target === "database.rules") {
        this.notes.databaseRulesFile = filePath;
        try {
          return fs.readFileSync(fullPath, "utf8");
        } catch (e) {
          if (e.code === "ENOENT") {
            throw new FirebaseError(`File not found: ${fullPath}`, { original: e });
          }
          throw e;
        }
      }
      return loadCJSON(fullPath);
    /* istanbul ignore-next */
    case ".bolt":
      if (target === "database") {
        this.notes.databaseRules = "bolt";
      }
      return parseBoltRules(fullPath);
    default:
      throw new FirebaseError(
        "Parse Error: " + filePath + " is not of a supported config file type",
        { exit: 1 }
      );
  }
};

Config.prototype.get = function (key, fallback) {
  return _.get(this.data, key, fallback);
};

Config.prototype.set = function (key, value) {
  return _.set(this.data, key, value);
};

Config.prototype.has = function (key) {
  return _.has(this.data, key);
};

Config.prototype.path = function (pathName) {
  var outPath = path.normalize(path.join(this.projectDir, pathName));
  if (_.includes(path.relative(this.projectDir, outPath), "..")) {
    throw new FirebaseError(clc.bold(pathName) + " is outside of project directory", { exit: 1 });
  }
  return outPath;
};

Config.prototype.readProjectFile = function (p, options) {
  options = options || {};
  try {
    var content = fs.readFileSync(this.path(p), "utf8");
    if (options.json) {
      return JSON.parse(content);
    }
    return content;
  } catch (e) {
    if (options.fallback) {
      return options.fallback;
    }
    if (e.code === "ENOENT") {
      throw new FirebaseError(`File not found: ${this.path(p)}`, { original: e });
    }
    throw e;
  }
};

Config.prototype.writeProjectFile = function (p, content) {
  if (typeof content !== "string") {
    content = JSON.stringify(content, null, 2) + "\n";
  }

  fs.ensureFileSync(this.path(p));
  fs.writeFileSync(this.path(p), content, "utf8");
};

Config.prototype.askWriteProjectFile = function (p, content) {
  var writeTo = this.path(p);
  var next;
  if (fsutils.fileExistsSync(writeTo)) {
    next = promptOnce({
      type: "confirm",
      message: "File " + clc.underline(p) + " already exists. Overwrite?",
      default: false,
    });
  } else {
    next = Promise.resolve(true);
  }

  var self = this;
  return next.then(function (result) {
    if (result) {
      self.writeProjectFile(p, content);
      utils.logSuccess("Wrote " + clc.bold(p));
    } else {
      utils.logBullet("Skipping write of " + clc.bold(p));
    }
  });
};

Config.load = function (options, allowMissing) {
  const pd = detectProjectRoot(options);
  const filename = options.configPath || Config.FILENAME;
  if (pd) {
    try {
      const filePath = path.resolve(pd, path.basename(filename));
      const data = cjson.load(filePath);
      return new Config(data, options);
    } catch (e) {
      throw new FirebaseError(`There was an error loading ${filename}:\n\n` + e.message, {
        exit: 1,
      });
    }
  }

  if (allowMissing) {
    return null;
  }

  throw new FirebaseError("Not in a Firebase app directory (could not locate firebase.json)", {
    exit: 1,
  });
};

module.exports = Config;
