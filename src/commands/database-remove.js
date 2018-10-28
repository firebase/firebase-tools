"use strict";

var Command = require("../command");
var requireInstance = require("../requireInstance");
var requirePermissions = require("../requirePermissions");
var request = require("request");
var api = require("../api");
var responseToError = require("../responseToError");
var pathLib = require("path");
var FirebaseError = require("../error");

var utils = require("../utils");
var querystring = require("querystring");
var prompt = require("../prompt");
var clc = require("cli-color");
var _ = require("lodash");

module.exports = new Command("database:remove <path>")
  .description("remove data from your Firebase at the specified path")
  .option("-y, --confirm", "pass this option to bypass confirmation prompt")
  .option("-v, --verbose", "show delete progress (helpful for large delete)")
  .option("-c, --concurrent <num>", "default=1000. configure the concurrent threshold")
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
      options.concurrent = options.concurrent || 1000;
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
                return utils.reject("Unexpected error while removing data at " + path, {
                  exit: 2,
                  original: err,
                });
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
                return utils.reject("Unexpected error while prefetching data to delete" + path, {
                  exit: 2,
                });
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
                  return resolve("larger");
                case 413:
                  // payload too large. large subtree, recursive delete for each subtree
                  return resolve("larger");
                default:
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
                return utils.reject("Unexpected error while list subtrees", {
                  exit: 2,
                  original: err,
                });
              } else if (res.statusCode >= 400) {
                return reject(responseToError(res, body));
              }
              var data = {};
              try {
                data = JSON.parse(body);
              } catch (e) {
                return utils.reject("Malformed JSON response in shallow get ", {
                  exit: 2,
                  original: e,
                });
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

      var deleteQueue = [path];
      var failures = [];
      var openChunkedDeleteJob = 0;

      function dfsLoop() {
        if (failures.length !== 0) {
          return true;
        }
        if (deleteQueue.length === 0) {
          return openChunkedDeleteJob === 0;
        }
        if (openChunkedDeleteJob < options.concurrent) {
          chunkedDelete(deleteQueue.pop());
        }
        return false;
      }

      function chunkedDelete(path) {
        openChunkedDeleteJob += 1;
        return prefetchTest(path)
          .then(function(test) {
            switch (test) {
              case "small":
                return deletePath(path);
              case "large":
                return listPath(path).then(function(pathList) {
                  if (pathList) {
                    deleteQueue.push(path);
                    for (var i = 0; i < pathList.length; i++) {
                      deleteQueue.push(pathLib.join(path, pathList[i]));
                    }
                  }
                  return Promise.resolve();
                });
              case "empty":
                return Promise.resolve();
              default:
                return utils.reject("unexpected prefetch test result: " + test, { exit: 2 });
            }
          })
          .then(function() {
            openChunkedDeleteJob -= 1;
          })
          .catch(function(error) {
            openChunkedDeleteJob -= 1;
            failures.push(error);
          });
      }

      return new Promise(function(resolve, reject) {
        var intervalId = setInterval(function() {
          if (dfsLoop()) {
            clearInterval(intervalId);

            if (failures.length == 0) {
              return resolve();
            } else if (failures.length == 1) {
              return reject(failure[0]);
            } else {
              return reject(
                new FirebaseError("multiple failures", {
                  children: failures,
                })
              );
            }
          }
        }, 0);
      }).then(function() {
        utils.logSuccess("Data removed successfully");
      });
    });
  });
