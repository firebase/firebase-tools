"use strict";

var glob = require("glob").sync;

module.exports = function(cwd, ignore) {
  return glob("**/*", {
    cwd: cwd,
    ignore: ["**/firebase-debug.log"].concat(ignore || []),
    nodir: true,
    nosort: true,
    follow: true,
    dot: true,
  });
};
