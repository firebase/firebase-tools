"use strict";

var fsutils = require("./fsutils");
var path = require("path");

module.exports = function(cwd) {
  var projectRootDir = cwd || process.cwd();
  if (typeof projectRootDir !== "string") {
    throw new Error(
      "Project Root Directory is not a string. Please change your directory under firebase.json to be a valid string for the source paramter."
    );
  }
  if (!projectRootDir) {
    throw new Error(
      'Project Root Directory is undefined. Please add a directory to your firebase.json. Example: \"source\":\"./functions\"'
    );
  }
  while (!fsutils.fileExistsSync(path.resolve(projectRootDir, "./firebase.json"))) {
    var parentDir = path.dirname(projectRootDir);
    if (parentDir === projectRootDir) {
      return null;
    }
    projectRootDir = parentDir;
  }
  return projectRootDir;
};
