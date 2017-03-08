'use strict';

var chalk = require('chalk');
var fs = require('fs');
var os = require('os');

var Command = require('../lib/command');
var accountExporter = require('../lib/accountExporter');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');

var MAX_BATCH_SIZE = 1000;

var validateOptions = accountExporter.validateOptions;
var serialExportUsers = accountExporter.serialExportUsers;

module.exports = new Command('auth:export [dataFile]')
    .description('Export accounts from your Firebase project into a data file')
    .option(
        '--format <format>', 'Format of exported data (csv, json). Ignored if [dataFile] has format extension.')
    .before(requireAccess)
    .action(function(dataFile, options) {
      var projectId = getProjectId(options);
      var checkRes = validateOptions(options, dataFile);
      if (!checkRes.format) {
        return checkRes;
      }
      var exportOptions = checkRes;
      var writeStream = fs.createWriteStream(dataFile);
      if (exportOptions.format === 'json') {
        writeStream.write('{"users": [' + os.EOL);
      }
      exportOptions.writeStream = writeStream;
      exportOptions.batchSize = MAX_BATCH_SIZE;
      logger.info('Exporting accounts to ' + chalk.bold(dataFile));
      return serialExportUsers(projectId, exportOptions).then(function() {
        if (exportOptions.format === 'json') {
          writeStream.write(']}');
        }
        writeStream.end();
      });
    });
