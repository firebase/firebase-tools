"use strict";

var logger = require("../../logger");
var utils = require("../../utils");
var track = require("../../track");
var listFiles = require("../../listFiles");
const resolveProjectPath = require("../../resolveProjectPath");
const Uploader = require("./uploader");

var clc = require("cli-color");
var SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

module.exports = function(context, options) {
  var debugging = options.debug || options.nonInteractive;

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

  if (!context.hosting) {
    return Promise.resolve();
  }

  var t0 = Date.now();
  const files = listFiles(
    resolveProjectPath(options.cwd, options.config.get("hosting.public")),
    options.config.get("hosting.ignore")
  );
  utils.logLabeledBullet("hosting", "found " + files.length + " files in public directory");
  const uploader = new Uploader({
    version: context.hosting.version,
    files: files,
    public: options.config.path(options.config.get("hosting.public")),
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
      utils.logLabeledSuccess("hosting", "file upload complete");
      var dt = Date.now() - t0;
      logger.debug("[hosting] deploy completed after " + dt + "ms");
      return track("Hosting Deploy", "success", dt);
    })
    .catch(function(err) {
      clearInterval(progressInterval);
      return Promise.reject(err);
    });
};
