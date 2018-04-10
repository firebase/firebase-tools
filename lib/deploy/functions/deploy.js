"use strict";

var _ = require("lodash");
var chalk = require("chalk");

var tmp = require("tmp");
var utils = require("../../utils");
var gcp = require("../../gcp");
var prepareFunctionsUpload = require("../../prepareFunctionsUpload");

var GCP_REGION = gcp.cloudfunctions.DEFAULT_REGION;

tmp.setGracefulCleanup();

module.exports = function(context, options, payload) {
  var _uploadSource = function(source) {
    return gcp.cloudfunctions
      .generateUploadUrl(context.projectId, GCP_REGION)
      .then(function(uploadUrl) {
        _.set(context, "uploadUrl", uploadUrl);
        uploadUrl = _.replace(uploadUrl, "https://storage.googleapis.com", "");
        return gcp.storage.upload(source, uploadUrl);
      });
  };
  if (options.config.get("functions")) {
    utils.logBullet(
      chalk.cyan.bold("functions:") +
        " preparing " +
        chalk.bold(options.config.get("functions.source")) +
        " directory for uploading..."
    );

    return prepareFunctionsUpload(context, options).then(function(result) {
      payload.functions = {
        triggers: options.config.get("functions.triggers"),
      };

      if (!result) {
        return undefined;
      }
      return _uploadSource(result)
        .then(function() {
          utils.logSuccess(
            chalk.green.bold("functions:") +
              " " +
              chalk.bold(options.config.get("functions.source")) +
              " folder uploaded successfully"
          );
        })
        .catch(function(err) {
          utils.logWarning(chalk.yellow("functions:") + " Upload Error: " + err.message);
          return Promise.reject(err);
        });
    });
  }
  return Promise.resolve();
};
