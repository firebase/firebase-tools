"use strict";

var { Command } = require("../command");
var requireInstance = require("../requireInstance");
var { requirePermissions } = require("../requirePermissions");
var request = require("request");
var api = require("../api");
var responseToError = require("../responseToError");
var logger = require("../logger");
var { FirebaseError } = require("../error");
var { Emulators } = require("../emulator/types");
var { printNoticeIfEmulated } = require("../emulator/commandUtils");

var utils = require("../utils");
var _ = require("lodash");
var fs = require("fs");
var url = require("url");

var _applyStringOpts = function(dest, src, keys, jsonKeys) {
  _.forEach(keys, function(key) {
    if (src[key]) {
      dest[key] = src[key];
    }
  });

  // some keys need JSON encoding of the querystring value
  _.forEach(jsonKeys, function(key) {
    var jsonVal;
    try {
      jsonVal = JSON.parse(src[key]);
    } catch (e) {
      jsonVal = src[key];
    }

    if (src[key]) {
      dest[key] = JSON.stringify(jsonVal);
    }
  });
};

module.exports = new Command("database:get <path>")
  .description("fetch and print JSON data at the specified path")
  .option("-o, --output <filename>", "save output to the specified file")
  .option("--pretty", "pretty print response")
  .option("--shallow", "return shallow response")
  .option("--export", "include priorities in the output response")
  .option("--order-by <key>", "select a child key by which to order results")
  .option("--order-by-key", "order by key name")
  .option("--order-by-value", "order by primitive value")
  .option("--limit-to-first <num>", "limit to the first <num> results")
  .option("--limit-to-last <num>", "limit to the last <num> results")
  .option("--start-at <val>", "start results at <val> (based on specified ordering)")
  .option("--end-at <val>", "end results at <val> (based on specified ordering)")
  .option("--equal-to <val>", "restrict results to <val> (based on specified ordering)")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action(function(path, options) {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }

    let dbUrl = utils.getDatabaseUrl(
      api.realtimeOriginOrEmulator,
      options.instance,
      path + ".json"
    );
    var query = {};
    if (options.shallow) {
      query.shallow = "true";
    }
    if (options.pretty) {
      query.print = "pretty";
    }
    if (options.export) {
      query.format = "export";
    }
    if (options.orderByKey) {
      options.orderBy = "$key";
    }
    if (options.orderByValue) {
      options.orderBy = "$value";
    }
    _applyStringOpts(
      query,
      options,
      ["limitToFirst", "limitToLast"],
      ["orderBy", "startAt", "endAt", "equalTo"]
    );

    const urlObj = new url.URL(dbUrl);
    Object.keys(query).forEach((key) => {
      urlObj.searchParams.set(key, query[key]);
    });

    dbUrl = urlObj.href;

    logger.debug("Query URL: ", dbUrl);
    var reqOptions = {
      url: dbUrl,
    };

    return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
      return new Promise(function(resolve, reject) {
        var fileOut = !!options.output;
        var outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
        var erroring;
        var errorResponse = "";
        var response;

        request
          .get(reqOptionsWithToken)
          .on("response", function(res) {
            response = res;
            if (response.statusCode >= 400) {
              erroring = true;
            }
          })
          .on("data", function(chunk) {
            if (erroring) {
              errorResponse += chunk;
            } else {
              outStream.write(chunk);
            }
          })
          .on("end", function() {
            outStream.write("\n", function() {
              resolve();
            });
            if (erroring) {
              try {
                var data = JSON.parse(errorResponse);
                return reject(responseToError(response, data));
              } catch (e) {
                return reject(
                  new FirebaseError("Malformed JSON response", {
                    exit: 2,
                    original: e,
                  })
                );
              }
            }
          })
          .on("error", reject);
      });
    });
  });
