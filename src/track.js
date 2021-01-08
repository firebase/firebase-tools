"use strict";

var ua = require("universal-analytics");

var _ = require("lodash");
var { configstore } = require("./configstore");
var pkg = require("../package.json");
var uuid = require("uuid");
var logger = require("./logger");

var anonId = configstore.get("analytics-uuid");
if (!anonId) {
  anonId = uuid.v4();
  configstore.set("analytics-uuid", anonId);
}

var visitor = ua(process.env.FIREBASE_ANALYTICS_UA || "UA-29174744-3", anonId, {
  strictCidFormat: false,
  https: true,
});

visitor.set("cd1", process.platform); // Platform
visitor.set("cd2", process.version); // NodeVersion
visitor.set("cd3", process.env.FIREPIT_VERSION || "none"); // FirepitVersion

module.exports = function (action, label, duration) {
  return new Promise(function (resolve) {
    if (!_.isString(action) || !_.isString(label)) {
      logger.debug("track received non-string arguments:", action, label);
      resolve();
    }
    duration = duration || 0;

    if (configstore.get("tokens") && configstore.get("usage")) {
      visitor.event("Firebase CLI " + pkg.version, action, label, duration).send(function () {
        // we could handle errors here, but we won't
        resolve();
      });
    } else {
      resolve();
    }
  });
};
