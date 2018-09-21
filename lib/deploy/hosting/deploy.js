"use strict";

var logger = require("../../logger");
var utils = require("../../utils");
var track = require("../../track");
var listFiles = require("../../listFiles");
const Uploader = require("./uploader");

var clc = require("cli-color");
var SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

module.exports = function(context, options) {
  if (!context.hosting || !context.hosting.deploys) {
    return Promise.resolve();
  }

  var spins = 0;
  function _updateSpinner(newMessage) {
    // don't try to rewrite lines if debugging since it's likely to get interrupted
    if (debugging) {
      utils.logLabeledBullet("hosting", newMessage);
    } else {
      process.stdout.write(clc.erase.line + clc.move.left(9999));
      process.stdout.write(
        clc.bold.cyan(SPINNER[spins % SPINNER.length] + "  hosting: ") + newMessage
      );
    }
    spins++;
  }

  function _runDeploys(deploys, debugging) {
    const deploy = deploys.shift();

    utils.logLabeledBullet("hosting[" + deploy.site + "]", "beginning deploy...");
    var t0 = Date.now();

    const publicDir = options.config.path(deploy.config.public);
    const files = listFiles(publicDir, deploy.config.ignore);

    utils.logLabeledBullet(
      "hosting[" + deploy.site + "]",
      "found " + files.length + " files in " + clc.bold(deploy.config.public)
    );
    const uploader = new Uploader({
      version: deploy.version,
      files: files,
      public: options.config.path(deploy.config.public),
    });

    var progressInterval = setInterval(function() {
      _updateSpinner(uploader.statusMessage());
    }, debugging ? 2000 : 200);

    return uploader
      .start()
      .then(function() {
        clearInterval(progressInterval);
        if (!debugging) {
          process.stdout.write(clc.erase.line + clc.move.left(9999));
        }
        utils.logLabeledSuccess("hosting[" + deploy.site + "]", "file upload complete");
        var dt = Date.now() - t0;
        logger.debug("[hosting] deploy completed after " + dt + "ms");
        return track("Hosting Deploy", "success", dt);
      })
      .catch(function(err) {
        clearInterval(progressInterval);
        return Promise.reject(err);
      })
      .then(function() {
        if (deploys.length) {
          return _runDeploys(deploys);
        }
      });
  }

  var debugging = options.debug || options.nonInteractive;
  const deploys = [].concat(context.hosting.deploys);
  return _runDeploys(deploys, debugging);
};
