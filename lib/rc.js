"use strict";

var _ = require("lodash");
var chalk = require("chalk");
var cjson = require("cjson");
var fs = require("fs");
var path = require("path");

var detectProjectRoot = require("./detectProjectRoot");
var FirebaseError = require("./error");
var fsutils = require("./fsutils");
var utils = require("./utils");

// "exclusive" target implies that a resource can only be assigned a single target name
var TARGET_TYPES = {
  storage: { resource: "bucket", exclusive: true },
  database: { resource: "instance", exclusive: true },
};

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
    this.set(["projects", alias], project);
    return this.save();
  },

  removeProjectAlias: function(alias) {
    this.unset(["projects", alias]);
    return this.save();
  },

  get hasProjects() {
    return _.size(this.data.projects) > 0;
  },

  get projects() {
    return this.get("projects", {});
  },

  targets: function(project, type) {
    return this.get(["targets", project, type], {});
  },

  target: function(project, type, name) {
    return this.get(["targets", project, type, name], []);
  },

  applyTarget: function(project, type, targetName, resources) {
    if (!TARGET_TYPES[type]) {
      throw new FirebaseError(
        "Unrecognized target type " +
          chalk.bold(type) +
          ". Must be one of " +
          _.keys(TARGET_TYPES).join(", "),
        { code: 1 }
      );
    }

    if (_.isString(resources)) {
      resources = [resources];
    }

    var changed = [];

    // remove resources from existing targets
    resources.forEach(
      function(resource) {
        var cur = this.findTarget(project, type, resource);
        if (cur && cur !== targetName) {
          this.unsetTargetResource(project, type, cur, resource);
          changed.push({ resource: resource, target: cur });
        }
      }.bind(this)
    );

    // apply resources to new target
    var existing = this.get(["targets", project, type, targetName], []);
    var list = _.uniq(existing.concat(resources)).sort();
    this.set(["targets", project, type, targetName], list);

    this.save();
    return changed;
  },

  removeTarget: function(project, type, resource) {
    var name = this.findTarget(project, type, resource);
    if (!name) {
      return null;
    }

    this.unsetTargetResource(project, type, name, resource);
    this.save();
    return name;
  },

  clearTarget: function(project, type, name) {
    var exists = this.target(project, type, name).length > 0;
    if (!exists) {
      return false;
    }
    this.unset(["targets", project, type, name]);
    this.save();
    return true;
  },

  /**
   * Finds a target name for the specified type and resource.
   */
  findTarget: function(project, type, resource) {
    var targets = this.get(["targets", project, type]);
    for (var targetName in targets) {
      if (_.includes(targets[targetName], resource)) {
        return targetName;
      }
    }
    return null;
  },

  /**
   * Removes a specific resource from a specified target. Does
   * not persist the result.
   */
  unsetTargetResource: function(project, type, name, resource) {
    var targetPath = ["targets", project, type, name];
    var updatedResources = this.get(targetPath, []).filter(function(r) {
      return r !== resource;
    });

    if (updatedResources.length) {
      this.set(targetPath, updatedResources);
    } else {
      this.unset(targetPath);
    }
  },

  /**
   * Throws an error if the specified target is not configured for
   * the specified project.
   */
  requireTarget: function(project, type, name) {
    if (!this.target(project, type, name).length) {
      throw new FirebaseError(
        "Deploy target " +
          chalk.bold(name) +
          " not configured for project " +
          chalk.bold(project) +
          ". Configure with:\n\n  firebase target:apply " +
          type +
          " " +
          name +
          " <resources...>",
        { exit: 1 }
      );
    }
  },

  /**
   * Persists the RC file to disk, or returns false if no path on the instance.
   */
  save: function() {
    if (this.path) {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), {
        encoding: "utf8",
      });
      return true;
    }
    return false;
  },
};

RC.loadFile = function(rcpath) {
  var data = {};
  if (fsutils.fileExistsSync(rcpath)) {
    try {
      data = cjson.load(rcpath);
    } catch (e) {
      // malformed rc file is a warning, not an error
      utils.logWarning("JSON error trying to load " + chalk.bold(rcpath));
    }
  }
  return new RC(rcpath, data);
};

RC.load = function(cwd) {
  cwd = cwd || process.cwd();
  var dir = detectProjectRoot(cwd);
  var potential = path.resolve(dir || cwd, "./.firebaserc");
  return RC.loadFile(potential);
};

module.exports = RC;
