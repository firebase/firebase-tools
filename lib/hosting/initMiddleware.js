"use strict";

var request = require("request");

var SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;

module.exports = function(init) {
  return function(req, res, next) {
    var match = req.url.match(SDK_PATH_REGEXP);
    if (match) {
      var url = "https://www.gstatic.com/firebasejs/" + match[1] + "/" + match[2];
      var preq = request(url).on("response", function(pres) {
        if (pres.statusCode === 404) {
          return next();
        }
        return preq.pipe(res);
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
