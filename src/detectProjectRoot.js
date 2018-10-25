"use strict";

var fsutils = require("./fsutils");
var path = require("path");

module.exports = function(cwd) {
  var projectRootDir = cwd || process.cwd();
  while (!fsutils.fileExistsSync(path.resolve(projectRootDir, "./firebase.json"))) {
    var parentDir = path.dirname(projectRootDir);
    if (parentDir === projectRootDir) {
      return null;
    }
    projectRootDir = parentDir;
  }
  return projectRootDir;
};
