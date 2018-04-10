"use strict";

var fs = require("fs");

module.exports = {
  fileExistsSync: function(path) {
    try {
      var stats = fs.statSync(path);
      return stats.isFile();
    } catch (e) {
      return false;
    }
  },
  dirExistsSync: function(path) {
    try {
      var stats = fs.statSync(path);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  },
};
