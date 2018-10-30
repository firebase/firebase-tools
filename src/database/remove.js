"use strict";

var pathLib = require("path");
var Queue = require("../queue");
var logger = require("../logger");
var api = require("../api");
var FirebaseError = require("../error");
var request = require("request");
var responseToError = require("../responseToError");
var utils = require("../utils");

class Remote {
  constructor(instance) {
    this.instance = instance;
  }

  deletePath(path) {
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
  }

  prefetchTest(path) {
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
  }

  listPath(path) {
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
  }
}

class DatabaseRemove {
  /**
   * Construct a new RTDB delete operation.
   *
   * @constructor
   * @param {string} path path to delete.
   * @param {string} options.instance the RTDB instance ID.
   * @param {string} options.concurrency the number of concurrent chunk delete allowed
   * @param {string} options.retires the number of retries for each chunk delete
   */
  constructor(path, options) {
    this.path = path;
    this.concurrency = options.concurrency;
    this.retries = options.retries;
    this.remote = options.remote || new Remote(options.instance);
  }

  chunkedDelete(path) {
    return this.remote
      .prefetchTest(path)
      .then(test => {
        switch (test) {
          case "small":
            return this.remote.deletePath(path);
          case "large":
            return this.remote.listPath(path).then(pathList => {
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
            return reject(
              new FirebaseError("unexpected prefetch test result: " + test, { exit: 2 })
            );
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
            if (this.waitingPath[parentPath] === 0) {
              this.jobQueue.add(parentPath);
              this.waitingPath.delete(parentPath);
            }
          }
        }
      });
  }

  execute() {
    this.waitingPath = new Map();
    this.jobQueue = new Queue({
      name: "long delete queue",
      concurrency: this.concurrency,
      handler: this.chunkedDelete.bind(this),
      retries: this.retries,
    });
    this.jobQueue.add(this.path);
    return this.jobQueue.wait();
  }
}

module.exports = DatabaseRemove;
