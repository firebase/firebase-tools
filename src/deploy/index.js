"use strict";

var logger = require("../logger");
var api = require("../api");
var clc = require("cli-color");
var _ = require("lodash");
var getProjectId = require("../getProjectId");
var utils = require("../utils");
var FirebaseError = require("../error");
var track = require("../track");
var lifecycleHooks = require("./lifecycleHooks");

var TARGETS = {
  hosting: require("./hosting"),
  database: require("./database"),
  firestore: require("./firestore"),
  functions: require("./functions"),
  storage: require("./storage"),
};

var _noop = function() {
  return Promise.resolve();
};

var _chain = function(fns, context, options, payload) {
  var latest = (fns.shift() || _noop)(context, options, payload);
  if (fns.length) {
    return latest.then(function() {
      return _chain(fns, context, options, payload);
    });
  }

  return latest;
};

/**
 * The `deploy()` function runs through a three step deploy process for a listed
 * number of deploy targets. This allows deploys to be done all together or
 * for individual deployable elements to be deployed as such.
 */
var deploy = function(targetNames, options) {
  var projectId = getProjectId(options);
  var payload = {};
  // a shared context object for deploy targets to decorate as needed
  var context = { projectId: projectId };
  var predeploys = [];
  var prepares = [];
  var deploys = [];
  var releases = [];
  var postdeploys = [];

  for (var i = 0; i < targetNames.length; i++) {
    var targetName = targetNames[i];
    var target = TARGETS[targetName];

    if (!target) {
      return Promise.reject(
        new FirebaseError(clc.bold(targetName) + " is not a valid deploy target", { exit: 1 })
      );
    }

    predeploys.push(lifecycleHooks(targetName, "predeploy"));
    if (target.prepare) {
      prepares.push(target.prepare);
    }
    if (target.deploy) {
      deploys.push(target.deploy);
    }
    if (target.release) {
      releases.push(target.release);
    }
    postdeploys.push(lifecycleHooks(targetName, "postdeploy"));
  }

  logger.info();
  logger.info(clc.bold(clc.white("===") + " Deploying to '" + projectId + "'..."));
  logger.info();

  utils.logBullet("deploying " + clc.bold(targetNames.join(", ")));

  return _chain(predeploys, context, options, payload)
    .then(function() {
      return _chain(prepares, context, options, payload);
    })
    .then(function() {
      return _chain(deploys, context, options, payload);
    })
    .then(function() {
      return _chain(releases, context, options, payload);
    })
    .then(function() {
      return _chain(postdeploys, context, options, payload);
    })
    .then(function() {
      if (_.has(options, "config.notes.databaseRules")) {
        track("Rules Deploy", options.config.notes.databaseRules);
      }

      logger.info();
      utils.logSuccess(clc.underline.bold("Deploy complete!"));
      logger.info();
      var deployedHosting = _.includes(targetNames, "hosting");
      logger.info(clc.bold("Project Console:"), utils.consoleUrl(options.project, "/overview"));
      if (deployedHosting) {
        _.each(context.hosting.deploys, function(deploy) {
          logger.info(clc.bold("Hosting URL:"), utils.addSubdomain(api.hostingOrigin, deploy.site));
        });
      }
    });
};

deploy.TARGETS = TARGETS;

module.exports = deploy;
