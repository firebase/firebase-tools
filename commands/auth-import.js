'use strict';

var RSVP = require('rsvp');
var csv = require('csv-streamify');
var chalk = require('chalk');
var fs = require('fs');
var jsonStream = require('JSONStream');
var _ = require('lodash');

var Command = require('../lib/command');
var accountImporter = require('../lib/accountImporter');
var getProjectId = require('../lib/getProjectId');
var logger = require('../lib/logger');
var requireAccess = require('../lib/requireAccess');
var utils = require('../lib/utils');

var MAX_BATCH_SIZE = 1000;
var validateOptions = accountImporter.validateOptions;
var validateUserJson = accountImporter.validateUserJson;
var transArrayToUser = accountImporter.transArrayToUser;
var serialImportUsers = accountImporter.serialImportUsers;

module.exports = new Command('auth:import [dataFile]')
  .description('import users into your Firebase project from a data file(.csv or .json)')
  .option('--hash-algo <hashAlgo>', 'specify the hash algorithm used in password for these accounts')
  .option('--hash-key <hashKey>', 'specify the key used in hash algorithm')
  .option('--salt-separator <saltSeparator>',
      'specify the salt separator which will be appended to salt when verifying password. only used by SCRYPT now.')
  .option('--rounds <rounds>', 'specify how many rounds for hash calculation.')
  .option('--mem-cost <memCost>', 'specify the memory cost for firebase scrypt, or cpu/memory cost for standard scrypt')
  .option('--parallelization <parallelization>', 'specify the parallelization for standard scrypt.')
  .option('--block-size <blockSize>', 'specify the block size (normally is 8) for standard scrypt.')
  .option('--dk-len <dkLen>', 'specify derived key length for standard scrypt.')
  .before(requireAccess)
  .action(function(dataFile, options) {
    var projectId = getProjectId(options);
    var checkRes = validateOptions(options);
    if (!checkRes.valid) {
      return checkRes;
    }
    var hashOptions = checkRes;

    if (!_.endsWith(dataFile, '.csv') && !_.endsWith(dataFile, '.json')) {
      return utils.reject('Data file must end with .csv or .json', {exit: 1});
    }
    var stats = fs.statSync(dataFile);
    var fileSizeInBytes = stats.size;
    logger.info('Processing ' + chalk.bold(dataFile) + ' (' + fileSizeInBytes + ' bytes)');

    var inStream = fs.createReadStream(dataFile);
    var batches = [];
    var currentBatch = [];
    return new RSVP.Promise(function(resolve, reject) {
      var parser;
      var counter = 0;
      if (dataFile.endsWith('.csv')) {
        parser = csv({objectMode: true});
        parser.on('data', function(line) {
          counter++;
          var user = transArrayToUser(line.map(
            function(str) {
              // Ignore starting '|'' and trailing '|''
              var newStr = str.trim().replace(/^["|'](.*)["|']$/, '$1');
              return newStr === '' ? undefined : newStr;
            }));
          currentBatch.push(user);
          if (currentBatch.length === MAX_BATCH_SIZE) {
            batches.push(currentBatch);
            currentBatch = [];
          }
        }).on('end', function() {
          if (currentBatch.length) {
            batches.push(currentBatch);
          }
          return resolve(batches);
        });
        inStream.pipe(parser);
      } else {
        parser = jsonStream.parse(['users', {emitKey: true}]);
        parser.on('data', function(pair) {
          counter++;
          var res = validateUserJson(pair.value);
          if (res.error) {
            return reject(res.error);
          }
          currentBatch.push(pair.value);
          if (currentBatch.length === MAX_BATCH_SIZE) {
            batches.push(currentBatch);
            currentBatch = [];
          }
        }).on('end', function() {
          if (currentBatch.length) {
            batches.push(currentBatch);
          }
          return resolve(batches);
        });
        inStream.pipe(parser);
      }
    }).then(function(userListArr) {
      if (userListArr.length) {
        return serialImportUsers(projectId, hashOptions, userListArr, 0);
      }
    });
  });
