"use strict";

var _ = require("lodash");
var clc = require("cli-color");

var FirebaseError = require("../error");
var functionsConfig = require("../functionsConfig");
var gcp = require("../gcp");
var getProjectId = require("../getProjectId");
var pollKits = require("./pollKits");
var utils = require("../utils");

var DEFAULT_REGION = gcp.cloudfunctions.DEFAULT_REGION;

function _getFunctionTrigger(cloudfunction, firebaseconfig, config) {
  if (cloudfunction.httpsTrigger) {
    return _.pick(cloudfunction, "httpsTrigger");
  } else if (cloudfunction.eventTrigger) {
    var trigger = cloudfunction.eventTrigger;
    var resource = "projects/_/buckets/" + firebaseconfig.storageBucket;
    if (config.OBJECT_PREFIX) {
      resource = resource + "/" + config.OBJECT_PREFIX;
    }
    trigger.resource = resource;
    return { eventTrigger: trigger };
  }
  return new FirebaseError("Could not parse function trigger, unknown trigger type.");
}

function _deployKitFunctions(functions, options, config, sourceUploadUrl) {
  var projectId = getProjectId(options);

  if (functions.constructor !== Array) {
    functions = [functions];
  }

  return functionsConfig.getFirebaseConfig(options).then(function(firebaseconfig) {
    // TODO: Do we deal with nested functions? How would we deal with nested functions
    return Promise.all(
      _.map(functions, function(cloudfunction) {
        var functionTrigger = _getFunctionTrigger(cloudfunction, firebaseconfig, config);
        return gcp.cloudfunctions.create({
          entryPoint: cloudfunction.entryPoint,
          functionName: config.kitname + "-" + cloudfunction.name,
          labels: {
            "goog-kit-source": config.kitsource,
            "goog-kit-name": config.kitname,
          },
          projectId: projectId,
          region: DEFAULT_REGION,
          sourceUploadUrl: sourceUploadUrl,
          trigger: functionTrigger,
        });
      })
    );
  });
}

module.exports = function(functions, options, config, sourceUploadUrl) {
  return _deployKitFunctions(functions, options, config, sourceUploadUrl).then(function(
    operations
  ) {
    var printSuccess = function() {
      return utils.logSuccess(clc.green.bold("kits: ") + "Your kit has successfully been deployed");
    };

    var printFail = function(reason) {
      utils.logWarning("Your kit could not be deployed.");
      utils.logWarning(reason);
      return new FirebaseError("Your kit could not be deployed.");
    };
    return pollKits(operations, printSuccess, printFail);
  });
};
