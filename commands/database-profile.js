'use strict';

var _ = require('lodash');

var Command = require('../lib/command');
var requireAccess = require('../lib/requireAccess');
var utils = require('../lib/utils');
var profiler = require('../lib/profiler');

var description = 'profile the Realtime Database and generate a usage report';

module.exports = new Command('database:profile')
  .description(description)
  .option('-o, --output <filename>', 'save the output to the specified file')
  .option('-d, --duration <seconds>', 'collect database usage information for the specified number of seconds')
  .option('--raw', 'output the raw stats collected as newline delimited json')
  .option('--no-collapse', 'prevent collapsing similar paths into $wildcard locations')
  .option('-i, --input <filename>', 'generate the report based on the specified file instead ' +
                                    'of streaming logs from the database')
  .before(requireAccess)
  .action(function(options) {
    // Validate options
    if (options.raw && options.input) {
      return utils.reject('Cannot specify both an input file and raw format', {exit: 1});
    } else if (options.parent.json && options.raw) {
      return utils.reject('Cannot output raw data in json format', {exit: 1});
    } else if (options.input && _.has(options, 'duration')) {
      return utils.reject('Cannot specify a duration for input files', {exit: 1});
    } else if (_.has(options, 'duration') && options.duration <= 0) {
      return utils.reject('Must specify a positive number of seconds', {exit: 1});
    }

    return profiler(options);
  });
