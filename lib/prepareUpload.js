"use strict";

var fs = require("fs");
var path = require("path");

var tar = require("tar");
var tmp = require("tmp");

var FirebaseError = require("./error");
var fsutils = require("./fsutils");
var listFiles = require("./listFiles");

module.exports = function(options) {
  var hostingConfig = options.config.get("hosting");
  var publicDir = options.config.path(hostingConfig.public);
  var indexPath = path.join(publicDir, "index.html");

  var tmpFile = tmp.fileSync({
    prefix: "firebase-upload-",
    postfix: ".tar.gz",
  });
  var manifest = listFiles(publicDir, hostingConfig.ignore);

  return tar
    .c(
      {
        gzip: true,
        file: tmpFile.name,
        cwd: publicDir,
        prefix: "public",
        follow: true,
        noDirRecurse: true,
        portable: true,
      },
      manifest.slice(0)
    )
    .then(function() {
      var stats = fs.statSync(tmpFile.name);
      return {
        file: tmpFile.name,
        stream: fs.createReadStream(tmpFile.name),
        manifest: manifest,
        foundIndex: fsutils.fileExistsSync(indexPath),
        size: stats.size,
      };
    })
    .catch(function(err) {
      return Promise.reject(
        new FirebaseError("There was an issue preparing Hosting files for upload.", {
          original: err,
          exit: 2,
        })
      );
    });
};
