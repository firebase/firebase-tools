"use strict";

var FirebaseError = require("../error");
var pathLib = require("path");
var Queue = require("../queue");
var logger = require("../logger");
var DatabaseRemoveHelper = require("./removeHelper");

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
    this.removeHelper = options.removeHelper || new DatabaseRemoveHelper(options.instance);
  }

  chunkedDelete(path) {
    return this.removeHelper
      .prefetchTest(path)
      .then(test => {
        switch (test) {
          case "small":
            return this.removeHelper.deletePath(path);
          case "large":
            return this.removeHelper.listPath(path).then(pathList => {
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
            if (this.waitingPath[parentPath] == 0) {
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
