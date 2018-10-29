"use strict";

var api = require("../api");
var request = require("request");
var responseToError = require("../responseToError");
var pathLib = require("path");
var utils = require("../utils");

/**
 * Construct a new Firestore delete operation.
 *
 * @constructor
 * @param {string} project the Firestore project ID.
 * @param {string} path path to a document or collection.
 * @param {boolean} options.recursive true if the delete should be recursive.
 * @param {boolean} options.shallow true if the delete should be shallow (non-recursive).
 * @param {boolean} options.allCollections true if the delete should universally remove all collections and docs.
 */
function DatabaseRemove(instance, path, options) {
  this.instance = instance;
  this.path = path;
  this.concurrency = options.concurrency;
  this.verbose = Boolean(options.verbose);
}

DatabaseRemove.prototype.deletePath = function(path) {
  return new Promise((resolve, reject) => {
    var url = utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?print=silent";
    var reqOptions = {
      url: url,
      json: true,
    };
    return api.addRequestHeaders(reqOptions).then(reqOptionsWithToken => {
      request.del(reqOptionsWithToken, (err, res, body) => {
        if (err) {
          return reject(
            new FirebaseError("Unexpected error while removing data at " + path, {
              exit: 2,
              original: err,
            })
          );
        } else if (res.statusCode >= 400) {
          return reject(responseToError(res, body));
        }
        if (this.verbose) {
          utils.logSuccess(
            "pending: " +
              this.deleteQueue.length +
              " in progress: " +
              this.openChunkedDeleteJob +
              " Sucessfully removed data at " +
              path
          );
        }
        return resolve(true);
      });
    });
  });
};

// return whether it times out or not
DatabaseRemove.prototype.prefetchTest = function(path) {
  var url = utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?timeout=100ms";
  var reqOptions = {
    url: url,
  };
  return api.addRequestHeaders(reqOptions).then(reqOptionsWithToken => {
    return new Promise((resolve, reject) => {
      if (this.verbose) {
        utils.logSuccess(
          "pending: " +
            this.deleteQueue.length +
            " in progress: " +
            this.openChunkedDeleteJob +
            " Checking " +
            path
        );
      }
      request.get(reqOptionsWithToken, (err, res, body) => {
        if (err) {
          return reject(
            new FirebaseError("Unexpected error while prefetching data to delete" + path, {
              exit: 2,
            })
          );
        }
        switch (res.statusCode) {
          case 200:
            if (body) {
              return resolve("small");
            } else {
              return resolve("empty");
            }
          case 400:
            // timeout. large subtree, recursive delete for each subtree
            return resolve("large");
          case 413:
            // payload too large. large subtree, recursive delete for each subtree
            return resolve("large");
          default:
            return reject(responseToError(res, body));
        }
      });
    });
  });
};

DatabaseRemove.prototype.listPath = function(path) {
  var url =
    utils.addSubdomain(api.realtimeOrigin, this.instance) +
    path +
    ".json?shallow=true&limitToFirst=10000";
  var reqOptions = {
    url: url,
  };
  return api.addRequestHeaders(reqOptions).then(reqOptionsWithToken => {
    return new Promise((resolve, reject) => {
      request.get(reqOptionsWithToken, (err, res, body) => {
        if (err) {
          return reject(
            new FirebaseError("Unexpected error while list subtrees", {
              exit: 2,
              original: err,
            })
          );
        } else if (res.statusCode >= 400) {
          return reject(responseToError(res, body));
        }
        var data = {};
        try {
          data = JSON.parse(body);
        } catch (e) {
          return reject(
            new FirebaseError("Malformed JSON response in shallow get ", {
              exit: 2,
              original: e,
            })
          );
        }
        if (data) {
          var keyList = Object.keys(data);
          return resolve(keyList);
        }
        return resolve([]);
      });
    });
  });
};

DatabaseRemove.prototype.chunkedDelete = function(path) {
  this.openChunkedDeleteJob += 1;
  return this.prefetchTest(path)
    .then(test => {
      switch (test) {
        case "small":
          return this.deletePath(path);
        case "large":
          return this.listPath(path).then(pathList => {
            if (pathList) {
              for (var i = 0; i < pathList.length; i++) {
                this.deleteQueue.push(pathLib.join(path, pathList[i]));
              }
              this.waitingPath[path] = pathList.length;
            }
            return Promise.resolve(false);
          });
        case "empty":
          return Promise.resolve(true);
        default:
          return reject(new FirebaseError("unexpected prefetch test result: " + test, { exit: 2 }));
      }
    })
    .then(deleted => {
      if (path !== this.path && deleted) {
        var parentPath = pathLib.dirname(path);
        this.waitingPath[parentPath] -= 1;
        if (this.waitingPath[parentPath] == 0) {
          this.deleteQueue.push(parentPath);
        }
      }
      this.openChunkedDeleteJob -= 1;
    })
    .catch(error => {
      this.failures.push(error);
    });
};

DatabaseRemove.prototype.depthFirstProcessLoop = function() {
  if (this.failures.length !== 0) {
    return true;
  }
  if (this.deleteQueue.length === 0) {
    return this.openChunkedDeleteJob === 0;
  }
  if (this.openChunkedDeleteJob < this.concurrency) {
    this.chunkedDelete(this.deleteQueue.pop());
  }
  return false;
};

DatabaseRemove.prototype.execute = function() {
  this.deleteQueue = [this.path];
  this.waitingPath = {};
  this.failures = [];
  this.openChunkedDeleteJob = 0;

  return new Promise((resolve, reject) => {
    var intervalId = setInterval(() => {
      if (this.depthFirstProcessLoop()) {
        clearInterval(intervalId);

        if (this.failures.length == 0) {
          return resolve();
        } else if (this.failures.length == 1) {
          return reject(this.failures[0]);
        } else {
          return reject(
            new FirebaseError("multiple this.failures", {
              children: this.failures,
            })
          );
        }
      }
    }, 0);
  });
};

module.exports = DatabaseRemove;
