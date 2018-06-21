"use strict";

var logger = require("../../logger");
var utils = require("../../utils");
var track = require("../../track");
var listFiles = require("../../listFiles");
const Uploader = require("./uploader");

module.exports = function(context, options) {
  if (!context.hosting) {
    return Promise.resolve();
  }

  var t0 = Date.now();
  const files = listFiles(
    options.config.get("hosting.public"),
    options.config.get("hosting.ignore")
  );
  utils.logLabeledBullet("hosting", "found " + files.length + " files in public directory");
  const uploader = new Uploader({
    version: context.hosting.version,
    files: files,
    public: options.config.path(options.config.get("hosting.public")),
  });

  utils.logLabeledBullet("hosting", "uploading files...");
  return uploader.start().then(function() {
    utils.logLabeledSuccess("hosting", "file upload complete");
    var dt = Date.now() - t0;
    logger.debug("[hosting] deploy completed after " + dt + "ms");
    return track("Hosting Deploy", "success", dt);
  });
};
