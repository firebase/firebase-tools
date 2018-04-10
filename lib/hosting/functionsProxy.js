"use strict";

var _ = require("lodash");
var logger = require("../logger");
var request = require("request");

var getProjectId = require("../getProjectId");

function _makeVary(vary) {
  if (!vary) {
    return "Accept-Encoding, Authorization, Cookie";
  }

  var varies = vary.split(/, ?/).map(function(v) {
    return v
      .split("-")
      .map(function(part) {
        return _.capitalize(part);
      })
      .join("-");
  });

  ["Accept-Encoding", "Authorization", "Cookie"].forEach(function(requiredVary) {
    if (!_.includes(varies, requiredVary)) {
      varies.push(requiredVary);
    }
  });

  return varies.join(", ");
}

module.exports = function(options) {
  return function(rewrite) {
    var url;
    var destLabel;
    if (_.includes(options.targets, "functions")) {
      destLabel = "local";
      url =
        "http://localhost:" +
        (options.port + 1) +
        "/" +
        getProjectId(options) +
        "/us-central1/" +
        rewrite.function;
    } else {
      destLabel = "live";
      url =
        "https://us-central1-" + getProjectId(options) + ".cloudfunctions.net/" + rewrite.function;
    }
    return Promise.resolve(function(req, res, next) {
      logger.info("[hosting] Rewriting", req.url, "to", destLabel, "function", rewrite.function);
      // Extract the __session cookie from headers to forward it to the functions
      var sessionCookie = (req.headers.cookie || "").split(/; ?/).find(function(c) {
        return c.trim().indexOf("__session=") === 0;
      });

      var proxied = request({
        method: req.method,
        qs: req.query,
        url: url + req.url,
        headers: {
          "X-Forwarded-Host": req.headers.host,
          "X-Original-Url": req.url,
          Pragma: "no-cache",
          "Cache-Control": "no-cache, no-store",
          // forward the parsed __session cookie if any
          Cookie: sessionCookie,
        },
        followRedirect: false,
        timeout: 60000,
      });

      req.pipe(proxied);

      proxied.on("error", function(err) {
        if (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT") {
          res.statusCode = 504;
          res.end("Timed out waiting for function to respond.");
        }

        res.statusCode = 500;
        return res.end(
          'An internal error occurred while connecting to Cloud Function "' + rewrite.function + '"'
        );
      });

      return proxied.on("response", function(response) {
        if (
          response.statusCode === 404 &&
          response.headers["x-cascade"] &&
          response.headers["x-cascade"].toUpperCase() === "PASS"
        ) {
          return next();
        }

        // default to private cache
        if (!response.headers["cache-control"]) {
          response.headers["cache-control"] = "private";
        }

        // don't allow cookies to be set on non-private cached responses
        if (response.headers["cache-control"].indexOf("private") < 0) {
          delete response.headers["set-cookie"];
        }

        response.headers.vary = _makeVary(response.headers.vary);

        return proxied.pipe(res);
      });
    });
  };
};
