"use strict";

var request = require("request");
var logger = require("../logger");
var utils = require("../utils");

var SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;

module.exports = function(init) {
  return function(req, res, next) {
    var match = req.url.match(SDK_PATH_REGEXP);
    if (match) {
      var version = match[1];
      var sdkName = match[2];
      var url = "https://www.gstatic.com/firebasejs/" + version + "/" + sdkName;
      var preq = request(url)
        .on("response", function(pres) {
          if (pres.statusCode === 404) {
            return next();
          }
          return preq.pipe(res);
        })
        .on("error", function(e) {
          utils.logLabeledWarning(
            "hosting",
            `Could not load Firebase SDK ${sdkName} v${version}, check your internet connection.`
          );
          logger.debug(e);
        });
    } else if (req.url === "/__/firebase/init.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(init.js);
    } else if (req.url === "/__/firebase/init.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(init.json);
    } else {
      next();
    }
  };
};
