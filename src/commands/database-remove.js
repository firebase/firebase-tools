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
    .option("-v, --verbose", "pass this option to show delete progress (helpful for large delete)")
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
            if (!options.confirm) {
                return utils.reject("Command aborted.", { exit: 1 });
            }
            var _chunkedDelete = function(path) {
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
                            request
                                .get(reqOptionsWithToken)
                                .on("response", function (res) {
                                    var response = res;
                                    if (response.statusCode >= 300) {
                                        if (response.statusCode != 400 && response.statusCode != 413) {
                                            return reject(responseToError(res, ""))
                                        }
                                        // large subtree, recursive delete for each subtree
                                        return resolve(true)
                                    } else {
                                        // small subtree
                                        return resolve(false)
                                    }
                                })
                                .on("error", function (error) {
                                    return reject(
                                        new FirebaseError("Unexpected error while prefetching data to delete", {
                                            exit: 2,
                                        })
                                    );
                                });
                        });
                    }).then(function (timeOut) {
                        if (timeOut) {
                            var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + path + ".json?";
                            url += querystring.stringify({
                                shallow: true
                            });
                            var reqOptions = {
                                url: url,
                            };
                            return api.addRequestHeaders(reqOptions)
                                .then(function(reqOptionsWithToken) {
                                    return new Promise(function (resolve, reject) {
                                        var shallowGetResponse = "";
                                        request
                                            .get(reqOptionsWithToken)
                                            .on("response", function (res) {
                                                var response = res;
                                                if (response.statusCode >= 300) {
                                                    return reject()
                                                }
                                            })
                                            .on("data", function(chunk) {
                                                shallowGetResponse += chunk;
                                            })
                                            .on("end", function () {
                                                try {
                                                    var data = JSON.parse(shallowGetResponse);
                                                    var keyList = Object.keys(data)
                                                    if (keyList)
                                                        return resolve(keyList)
                                                    else
                                                        return resolve([])
                                                } catch (e) {
                                                    return reject(
                                                        new FirebaseError("Malformed JSON response in shallow get ", {
                                                            exit: 2,
                                                            original: e,
                                                        })
                                                    );
                                                }
                                            })
                                            .on("error", function (error) {
                                                return reject(
                                                    new FirebaseError("Unexpected error while list subtrees", {
                                                        exit: 2,
                                                    })
                                                );
                                            });
                                    }).then(function (paths){
                                        var prom = Promise.resolve();
                                        for (var i = 0; i < paths.length; i++) {
                                            const subPath = path + (path == "/"? "" : "/") + paths[i]
                                            prom = prom.then(function(){
                                                return _chunkedDelete(subPath);
                                            })
                                        }
                                        return prom
                                    });
                                })
                        } else {
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
                    })
            }
            return _chunkedDelete(path)
                .then(function() {
                    utils.logSuccess("Data removed successfully");
                })
        });
    });
