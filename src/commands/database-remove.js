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

            function deletePath(path){
                return new Promise(function (resolve, reject) {
                    var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
                    var reqOptions = {
                        url: url,
                        json: true,
                    };
                    return api.addRequestHeaders(reqOptions)
                        .then(function(reqOptionsWithToken) {
                            request.del(reqOptionsWithToken, function(err, res, body) {
                                if (err) {
                                    return reject(
                                        new FirebaseError("Unexpected error while removing data", {
                                            exit: 2,
                                        })
                                    );
                                } else if (res.statusCode >= 400) {
                                    return reject(responseToError(res, body));
                                }
                                if (options.verbose) {
                                    var pathString = path
                                    var pathList = path.split("\/");
                                    if (pathList.length > 6) {
                                        var firstTwoPaths = pathList.slice(0, 2).join("/");
                                        var lastTwoPaths = "/" + pathList.slice(pathList.length-2).join("/");
                                        pathString = firstTwoPaths + "..["+(pathList.length-4)+"].." + lastTwoPaths;
                                    }
                                    utils.logSuccess("Sucessfully removed data at " + pathString);
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
                    timeout: '100ms'
                });
                var reqOptions = {
                    url: url
                };
                return api.addRequestHeaders(reqOptions)
                    .then(function(reqOptionsWithToken) {
                        return new Promise(function (resolve, reject) {
                            request.get(reqOptionsWithToken, function(err, res, body) {
                                if (err) {
                                    return reject(
                                        new FirebaseError("Unexpected error while prefetching data to delete", {
                                            exit: 2,
                                        })
                                    );
                                } else if (res.statusCode == 200) {
                                    // small subtree
                                    return resolve(false)
                                } else if (res.statusCode == 400 || res.statusCode == 413) {
                                    // timeout or payload too large
                                    // large subtree, recursive delete for each subtree
                                    return resolve(true)
                                } else {
                                    return reject(responseToError(res, body));
                                }
                            })
                        });
                    });
            }

            function listPath(path) {
                var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
                if (path === "/") {
                    url += querystring.stringify({
                        shallow: true
                    });
                } else {
                    url += querystring.stringify({
                        shallow: true,
                        limitToFirst: options.concurrent
                    });
                }
                var reqOptions = {
                    url: url,
                };
                return api.addRequestHeaders(reqOptions)
                    .then(function(reqOptionsWithToken) {
                        return new Promise(function (resolve, reject) {
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
                                var keyList = Object.keys(data)
                                if (keyList)
                                    return resolve(keyList)
                                else
                                    return resolve([])
                            })
                        });
                    });
            }

            function deleteList(path) {
                function deleteUntilEmpty(startAfter) {
                    return listPath(path).then(function(ls) {
                        if (ls.length === 0) {
                            return Promise.resolve();
                        } else {
                            return batchDeleteHandler(ls).then(deleteUntilEmpty);
                        }
                    })
                }
                return deleteUntilEmpty();
            }

            function doBatchJob(pathList) {
                return function () {
                    var batchPromises = pathList.map(function(path) {
                        return chunckedDelete(path);
                    });
                    return Promise.all(batchPromises).then(pathList[pathList.length-1]);
                }
            }

            function batchDeleteHandler(paths){
                var pathQueue = [];
                var prom = Promise.resolve();
                for (var i = 0; i < paths.length; i++) {
                    var subPath = path + (path === "/"? "" : "/") + paths[i]
                    pathQueue.push(subPath);
                    // double check to limit concurrent requests
                    if (pathQueue.length >= options.concurrent) {
                        prom = prom.then(doBatchJob(pathQueue));
                        pathQueue = [];
                    }
                }
                prom = prom.then(doBatchJob(pathQueue));
                return prom;
            }


            function chunckedDelete(path) {
                return prefetchTest(path)
                    .then(function (timeOut) {
                        if (timeOut) {
                            return deleteList(path);
                        } else {
                            return deletePath(path)
                        }
                    });
            }

            return chunckedDelete(path)
                .then(function() {
                    utils.logSuccess("Data removed successfully");
                });
        });
    });
