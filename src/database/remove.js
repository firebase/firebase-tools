"use strict";

var api = require("../api");
var FirebaseError = require("../error");
var request = require("request");
var responseToError = require("../responseToError");
var pathLib = require("path");
var utils = require("../utils");
var Queue = require("../queue");
const logger = require("../logger");

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
  this.allowRetry = options.allowRetry;
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
        logger.debug("[database] Sucessfully removed data at " + path);
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
      logger.debug("[database] Prefetching test at " + path);
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
  if (path === "/") {
    // there is a known bug with shallow and limitToFirst at "/"
    // TODO remove after the bug is fixed
    url = utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?shallow=true";
  }
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
  return this.prefetchTest(path)
    .then(test => {
      switch (test) {
        case "small":
          return this.deletePath(path);
        case "large":
          return this.listPath(path).then(pathList => {
            if (pathList) {
              for (var i = 0; i < pathList.length; i++) {
                this.jobQueue.add(pathLib.join(path, pathList[i]));
              }
              this.waitingPath[path] = pathList.length;
            }
            return false;
          });
        case "empty":
          return true;
        default:
          return reject(new FirebaseError("unexpected prefetch test result: " + test, { exit: 2 }));
      }
    })
    .then(deleted => {
      if (deleted) {
        if (path === this.path) {
          this.jobQueue.close();
          logger.debug("[database][long delete queue][FINAL]", this.jobQueue.stats());
        } else {
          var parentPath = pathLib.dirname(path);
          this.waitingPath[parentPath] -= 1;
          if (this.waitingPath[parentPath] == 0) {
            this.jobQueue.add(parentPath);
            this.waitingPath.delete(parentPath);
          }
        }
      }
    });
};

DatabaseRemove.prototype.execute = function() {
  this.waitingPath = new Map();
  this.jobQueue = new Queue({
    name: "long delete queue",
    concurrency: this.concurrency,
    handler: this.chunkedDelete.bind(this),
    retries: this.retries,
  });
  this.jobQueue.add(this.path);
  return this.jobQueue.wait();
};

module.exports = DatabaseRemove;
