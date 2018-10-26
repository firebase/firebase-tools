"use strict";

var Command = require("../command");
var requireInstance = require("../requireInstance");
var requirePermissions = require("../requirePermissions");
var request = require("request");
var api = require("../api");
var responseToError = require("../responseToError");
var FirebaseError = require("../error");

var utils = require("../lib/utils");
var querystring = require("querystring");
var prompt = require("../lib/prompt");
var clc = require("cli-color");
var _ = require("lodash");

module.exports = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option("-v, --verbose", "show delete progress (helpful for large delete)")
  .option("-c, --concurrent <num>", "default=100. configure the concurrent threshold")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .action(function(path, options) {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    return prompt(options, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message:
          "You are about to remove all data at " +
          clc.cyan(utils.addSubdomain(api.realtimeOrigin, options.instance) + path) +
          ". Are you sure?",
      },
    ]).then(function() {
      if (!options.concurrent) {
        options.concurrent = 100;
      }
      if (!options.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      function deletePath(path) {
        return new Promise(function(resolve, reject) {
          var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
          var reqOptions = {
            url: url,
            json: true,
          };
          return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
            request.del(reqOptionsWithToken, function(err, res, body) {
              if (err) {
                return reject(
                  new FirebaseError("Unexpected error while removing data at " + path, {
                    exit: 2,
                  })
                );
              } else if (res.statusCode >= 400) {
                return reject(responseToError(res, body));
              }
              if (options.verbose) {
                utils.logSuccess("Sucessfully removed data at " + path);
              }
              return resolve();
            });
          });
        });
      }

      // return whether it times out or not
      function prefetchTest(path) {
        var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
        url += querystring.stringify({
          timeout: "100ms",
        });
        var reqOptions = {
          url: url,
        };
        return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
          return new Promise(function(resolve, reject) {
            request.get(reqOptionsWithToken, function(err, res, body) {
              if (err) {
                return reject(
                  new FirebaseError("Unexpected error while prefetching data to delete", {
                    exit: 2,
                  })
                );
              } else if (res.statusCode == 200) {
                if (res) {
                  return resolve("small");
                } else {
                  return resolve("empty");
                }
                // small subtree
              } else if (res.statusCode == 400 || res.statusCode == 413) {
                // timeout or payload too large
                // large subtree, recursive delete for each subtree
                return resolve("larger");
              } else {
                return reject(responseToError(res, body));
              }
            });
          });
        });
      }

      function listPath(path) {
        var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
        if (path === "/") {
          url += querystring.stringify({
            shallow: true,
          });
        } else {
          url += querystring.stringify({
            shallow: true,
            limitToFirst: "100",
          });
        }
        var reqOptions = {
          url: url,
        };
        return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
          return new Promise(function(resolve, reject) {
            request.get(reqOptionsWithToken, function(err, res, body) {
              if (err) {
                return reject(
                  new FirebaseError("Unexpected error while list subtrees", {
                    exit: 2,
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
              } else {
                return resolve([]);
              }
            });
          });
        });
      }

      var deleteQueue = [path];
      var failures = [];
      var openChunkDeleteJob = 0;

      function dfsLoop() {
        if (failures.length !== 0) {
          return true;
        }
        if (deleteQueue.length === 0) {
          return openChunkDeleteJob === 0;
        }
        if (openChunkDeleteJob < options.concurrent) {
          chunckedDelete(deleteQueue.pop());
        }
        return false;
      }

      function chunckedDelete(path) {
        openChunkDeleteJob += 1;
        return prefetchTest(path)
          .then(function(test) {
            if (test === "small") {
              return deletePath(path);
            } else if (test === "larger") {
              return listPath(path).then(function(pathList) {
                if (pathList) {
                  deleteQueue.push(path);
                  for (var i = 0; i < pathList.length; i++) {
                    var subPath = path + (path === "/" ? "" : "/") + pathList[i];
                    deleteQueue.push(subPath);
                  }
                }
                return Promise.resolve();
              });
            } else if (test === "empty") {
              return Promise.resolve();
            } else {
              logger.error("unexpected prefetch test result: " + test);
              return reject(
                new FirebaseError("unexpected prefetch test result: " + test, {
                  exit: 2,
                  original: e,
                })
              );
            }
          })
          .then(function() {
            openChunkDeleteJob -= 1;
          })
          .catch(function(error) {
            openChunkDeleteJob -= 1;
            failures.push(error);
          });
      }

      return new Promise(function(resolve, reject) {
        var intervalId = setInterval(function() {
          if (dfsLoop()) {
            clearInterval(intervalId);

            if (failures.length == 0) {
              return resolve();
            } else if (failures.length == 0) {
              return reject(failure[0]);
            } else {
              return new FirebaseError("multiple failures", {
                children: failures,
              });
            }
          }
        }, 0);
      }).then(function() {
        utils.logSuccess("Data removed successfully");
      });
    });
  });
