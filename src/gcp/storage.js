"use strict";

var path = require("path");
var api = require("../api");
const { logger } = require("../logger");
var { FirebaseError } = require("../error");

function _getDefaultBucket(projectId) {
  return api
    .request("GET", "/v1/apps/" + projectId, {
      auth: true,
      origin: api.appengineOrigin,
    })
    .then(
      function (resp) {
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
      function (err) {
        logger.info(
          "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support."
        );
        return Promise.reject(err);
      }
    );
}

async function _uploadSource(source, uploadUrl) {
  const url = new URL(uploadUrl);
  const result = await api.request("PUT", url.pathname + url.search, {
    data: source.stream,
    headers: {
      "Content-Type": "application/zip",
      "x-goog-content-length-range": "0,104857600",
    },
    json: false,
    origin: url.origin,
    logOptions: { skipRequestBody: true },
  });

  return {
    generation: result.response.headers["x-goog-generation"],
  };
}

/**
 * Uploads a zip file to the specified bucket using the firebasestorage api.
 * @param {!Object<string, *>} source a zip file to upload. Must contain:
 *    - `file` {string}: file name
 *    - `stream` {Stream}: read stream of the archive
 * @param {string} bucketName a bucket to upload to
 */
async function _uploadObject(source, bucketName) {
  if (path.extname(source.file) !== ".zip") {
    throw new FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
  }
  const location = `/${bucketName}/${path.basename(source.file)}`;
  const result = await api.request("PUT", location, {
    auth: true,
    data: source.stream,
    headers: {
      "Content-Type": "application/zip",
      "x-goog-content-length-range": "0,123289600",
    },
    json: false,
    origin: api.storageOrigin,
    logOptions: { skipRequestBody: true },
  });
  return {
    bucket: bucketName,
    object: path.basename(source.file),
    generation: result.response.headers["x-goog-generation"],
  };
}

/**
 * Deletes an object via Firebase Storage.
 * @param {string} location A Firebase Storage location, of the form "/v0/b/<bucket>/o/<object>"
 */
function _deleteObject(location) {
  return api.request("DELETE", location, {
    auth: true,
    origin: api.storageOrigin,
  });
}

module.exports = {
  getDefaultBucket: _getDefaultBucket,
  deleteObject: _deleteObject,
  upload: _uploadSource,
  uploadObject: _uploadObject,
};
