"use strict";

var fs = require("fs");
var _ = require("lodash");
var ora = require("ora");
var readline = require("readline");
var request = require("request");

var tmp = require("tmp");

var api = require("./api");
var utils = require("./utils");
var ProfileReport = require("./profileReport");
var FirebaseError = require("./error");
var responseToError = require("./responseToError");

module.exports = function(options) {
  var url = utils.addSubdomain(api.realtimeOrigin, options.instance) + "/.settings/profile.json?";

  var rl = readline.createInterface({
    input: process.stdin,
  });

  var reqOptions = {
    url: url,
    headers: {
      Accept: "text/event-stream",
    },
  };

  return api.addRequestHeaders(reqOptions).then(function(reqOptionsWithToken) {
    return new Promise(function(resolve, reject) {
      var fileOut = !!options.output;
      var tmpFile = tmp.tmpNameSync();
      var tmpStream = fs.createWriteStream(tmpFile);
      var outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
      var counter = 0;
      var spinner = ora({
        text: "0 operations recorded. Press [enter] to stop",
        color: "yellow",
      });
      var outputFormat = options.raw ? "RAW" : options.parent.json ? "JSON" : "TXT"; // eslint-disable-line no-nested-ternary
      var erroring;
      var errorResponse = "";
      var response;

      var generateReport = _.once(function() {
        rl.close();
        spinner.stop();
        if (erroring) {
          fs.unlinkSync(tmpFile);
          try {
            var data = JSON.parse(errorResponse);
            return reject(responseToError(response, data));
          } catch (e) {
            // If it wasn't JSON, then it was a text response, technically it should always
            // a text response because of the Accept header we set, but you never know.
            // Examples of errors here is the popular "Permission Denied".
            return reject(
              new FirebaseError(errorResponse, {
                exit: 2,
              })
            );
          }
        } else if (response) {
          response.destroy();
          response = null;
        }
        var dataFile = options.input || tmpFile;
        var reportOptions = {
          format: outputFormat,
          isFile: fileOut,
          isInput: !!options.input,
          collapse: options.collapse,
        };
        var report = new ProfileReport(dataFile, outStream, reportOptions);
        report.generate().then(
          function(result) {
            fs.unlinkSync(tmpFile);
            resolve(result);
          },
          function(e) {
            reject(e);
          }
        );
      });

      if (options.input) {
        // If there is input, don't contact the server
        return generateReport();
      }

      request
        .get(reqOptionsWithToken)
        .on("response", function(res) {
          response = res;
          if (response.statusCode >= 400) {
            erroring = true;
          } else if (!_.has(options, "duration")) {
            spinner.start();
          }
        })
        .on("data", function(chunk) {
          if (erroring) {
            errorResponse += chunk.toString();
            return;
          }
          tmpStream.write(chunk);
          if (chunk.toString().indexOf("event: log") >= 0) {
            counter++;
            spinner.text = counter + " operations recorded. Press [enter] to stop";
          }
        })
        .on("end", function() {
          spinner.text = counter + " operations recorded.\n";
          generateReport();
        })
        .on("error", function() {
          spinner.text = counter + " operations recorded.\n";
          erroring = true;
          generateReport();
        });

      if (_.has(options, "duration")) {
        setTimeout(generateReport, options.duration * 1000);
      } else {
        // On newline, generate the report.
        rl.question("", generateReport);
      }
    });
  });
};
