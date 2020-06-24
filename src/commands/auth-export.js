"use strict";

var clc = require("cli-color");
var fs = require("fs");
var os = require("os");

var { Command } = require("../command");
var accountExporter = require("../accountExporter");
var getProjectId = require("../getProjectId");
var logger = require("../logger");
var { requirePermissions } = require("../requirePermissions");

var MAX_BATCH_SIZE = 1000;

var validateOptions = accountExporter.validateOptions;
var serialExportUsers = accountExporter.serialExportUsers;

module.exports = new Command("auth:export [dataFile]")
  .description("Export accounts from your Firebase project into a data file")
  .option(
    "--format <format>",
    "Format of exported data (csv, json). Ignored if [dataFile] has format extension."
  )
  .before(requirePermissions, ["firebaseauth.users.get"])
  .action(function(dataFile, options) {
    var projectId = getProjectId(options);
    var checkRes = validateOptions(options, dataFile);
    if (!checkRes.format) {
      return checkRes;
    }
    var exportOptions = checkRes;
    var writeStream = fs.createWriteStream(dataFile);
    if (exportOptions.format === "json") {
      writeStream.write('{"users": [' + os.EOL);
    }
    exportOptions.writeStream = writeStream;
    exportOptions.batchSize = MAX_BATCH_SIZE;
    logger.info("Exporting accounts to " + clc.bold(dataFile));
    return serialExportUsers(projectId, exportOptions).then(function() {
      if (exportOptions.format === "json") {
        writeStream.write("]}");
      }
      writeStream.end();
      // Ensure process ends only when all data have been flushed
      // to the output file
      return new Promise(function(resolve, reject) {
        writeStream.on("finish", resolve);
        writeStream.on("close", resolve);
        writeStream.on("error", reject);
      });
    });
  });
