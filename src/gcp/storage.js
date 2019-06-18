"use strict";

var api = require("../api");
var logger = require("../logger");
var FirebaseError = require("../error");

function _getDefaultBucket(projectId) {
  return api
    .request("GET", "/v1/apps/" + projectId, {
      auth: true,
      origin: api.appengineOrigin,
    })
    .then(
      function(resp) {
        if (resp.body.defaultBucket === "undefined") {
          logger.debug("Default storage bucket is undefined.");
          return Promise.reject(
            new FirebaseError(
              "Your project is being set up. Please wait a minute before deploying again."
            )
          );
        }
        return Promise.resolve(resp.body.defaultBucket);
      },
      function(err) {
        logger.info(
          "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support."
        );
        return Promise.reject(err);
      }
    );
}

function _uploadSource(source, uploadUrl) {
  return api.request("PUT", uploadUrl, {
    data: source.stream,
    headers: {
      "Content-Type": "application/zip",
      "x-goog-content-length-range": "0,104857600",
    },
    json: false,
    origin: api.storageOrigin,
  });
}

module.exports = {
  getDefaultBucket: _getDefaultBucket,
  upload: _uploadSource,
};
