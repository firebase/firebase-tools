'use strict';

var chalk = require('chalk');
var _ = require('lodash');
var RSVP = require('rsvp');

var FirebaseError = require('../../error');
var gcp = require('../../gcp');
var logger = require('../../logger');
var track = require('../../track');
var utils = require('../../utils');
var pollOperation = require('../../pollOperations');

module.exports = function(context, options, payload) {
  if (!options.config.has('functions')) {
    return RSVP.resolve();
  }

  var GCP_REGION = 'us-central1';
  var projectId = context.projectId;
  var sourceUrl = 'gs://' + context.functionsBucket + '/' + gcp.storage.archiveName;
  var legacySourceUrl = 'gs://' + projectId + '-gcf/' + projectId;

  var functionsInfo = payload.functions.triggers;
  var uploadedNames = _.map(functionsInfo, 'name');
  var timings = {};
  var failedDeployments = 0;
  var deployments = [];

  function _startTimer(name, type) {
    timings[name] = {type: type, t0: process.hrtime()};
  }

  function _endTimer(name) {
    if (!timings[name]) {
      logger.debug('[functions] no timer initialized for', name, timings[name].type);
      return;
    }

    // hrtime returns a duration as an array of [seconds, nanos]
    var duration = process.hrtime(timings[name].t0);
    track('Functions Deploy (Duration)', timings[name].type, duration[0] * 1000 + Math.round(duration[1] * 1e-6));
  }

  function _fetchTriggerUrls(ops) {
    if (!_.find(ops, ['retryParams.trigger.httpsTrigger', {}])) {
      return RSVP.resolve();
    }
    return gcp.cloudfunctions.list(projectId, GCP_REGION).then(function(functions) {
      var httpFunctions = _.chain(functions).filter({ sourceArchiveUrl: sourceUrl}).filter('httpsTrigger').value();
      _.forEach(httpFunctions, function(httpFunc) {
        _.chain(ops).find({ func: httpFunc.name }).assign({ triggerUrl: httpFunc.httpsTrigger.url}).value();
      });
      return RSVP.resolve();
    });
  }

  function _functionMatchesGroup(functionName, groupChunks) {
    return _.isEqual(groupChunks, functionName.split('-').slice(0, groupChunks.length));
  }

  function _getFilterGroups() {
    if (!options.only) {
      return [];
    }

    var opts;
    return _.chain(options.only.split(','))
      .filter(function(filter) {
        opts = filter.split(':');
        return opts[0] === 'functions' && opts[1];
      }).map(function(filter) {
        return filter.split(':')[1].split('.');
      }).value();
  }

  function _getReleaseNames(uploadNames, existingNames, functionFilterGroups) {
    if (functionFilterGroups.length === 0) {
      return uploadNames;
    }

    var allFunctions = _.union(uploadNames, existingNames);
    return _.filter(allFunctions, function(functionName) {
      return _.some(_.map(functionFilterGroups, function(groupChunks) {
        return _functionMatchesGroup(functionName, groupChunks);
      }));
    });
  }

  function logFilters(existingNames, releaseNames, functionFilterGroups) {
    if (functionFilterGroups.length === 0) {
      return;
    }

    logger.debug('> [functions] filtering triggers to: ' + JSON.stringify(releaseNames, null, 2));
    track('Functions Deploy with Filter', '', releaseNames.length);

    if (existingNames.length > 0) {
      utils.logBullet(chalk.bold.cyan('functions: ') + 'current functions in project: ' + existingNames.join(', '));
    }
    if (releaseNames.length > 0) {
      utils.logBullet(chalk.bold.cyan('functions: ') + 'uploading functions in project: ' + releaseNames.join(', '));
    }

    var allFunctions = _.union(releaseNames, existingNames);
    var unmatchedFilters = _.chain(functionFilterGroups)
      .filter(function(filterGroup) {
        return !_.some(_.map(allFunctions, function(functionName) {
          return _functionMatchesGroup(functionName, filterGroup);
        }));
      }).map(function(group) {
        return group.join('-');
      }).value();
    if (unmatchedFilters.length > 0) {
      utils.logWarning(chalk.bold.yellow('functions: ') + 'the following filters were specified but do not match any functions in the project: ' + unmatchedFilters.join(', '));
    }
  }

  function pollAndManageOperations(operations) {
    var interval;
    if (_.size(operations) > 15) {
      interval = 10 * 1000;
    } else {
      interval = 5 * 1000;
    }
    var pollFunction = gcp.cloudfunctions.check;
    var printSuccess = function(op) {
      _endTimer(op.functionName);
      utils.logSuccess(chalk.bold.green('functions[' + op.functionName + ']: ') + 'Successful ' + op.type + ' operation. ');
      if (op.triggerUrl && op.type !== 'delete') {
        logger.info(chalk.bold('Function URL'), '(' + op.funcName + '):', op.triggerUrl);
      }
    };
    var printFail = function(op) {
      _endTimer(op.functionName);
      failedDeployments += 1;
      utils.logWarning(chalk.bold.yellow('functions[' + op.functionName + ']: ') + 'Deploy Error: ' + op.error.message);
    };
    var retryCondition = function(result) {
      // The error codes from a Google.LongRunning operation follow google.rpc.Code format.
      if (_.includes([
        3,  // invalid argument
        5,  // not found
        6,  // already exists
        7,  // permission denied
        8,  // resource exhausted (quota issue)
        9,  // failed precondition
        11, // out of range
        12, // unimplemented
        16  // unauthenticated
      ], result.error.code)) {
        return false;
      }
      return true;
    };
    return pollOperation.pollAndRetry(operations, pollFunction, interval, printSuccess, printFail, retryCondition).then(function() {
    });
  }

  function _prepFunctionOp(functionInfo) {
    if (functionInfo.httpsTrigger) {
      return RSVP.resolve(_.pick(functionInfo, 'httpsTrigger'));
    } else if (functionInfo.eventTrigger) {
      var trigger = functionInfo.eventTrigger;
      return RSVP.resolve({eventTrigger: trigger});
    }
    logger.debug('Unknown trigger type found in:', functionInfo);
    return RSVP.reject(new Error('Could not parse function trigger, unknown trigger type.'));
  }

  delete payload.functions;
  return gcp.cloudfunctions.list(projectId, GCP_REGION).then(function(existingFunctions) {
    var pluckName = function(functionObject) {
      var fullName = _.get(functionObject, 'name'); // e.g.'projects/proj1/locations/us-central1/functions/func'
      return _.last(fullName.split('/'));
    };

    var existingNames = _.map(existingFunctions, pluckName);
    var functionFilterGroups = _getFilterGroups();
    var releaseNames = _getReleaseNames(uploadedNames, existingNames, functionFilterGroups);

    logFilters(existingNames, releaseNames, functionFilterGroups);

    var createOps = _.chain(uploadedNames)
      .difference(existingNames)
      .intersection(releaseNames)
      .map(function(functionName) {
        var functionInfo = _.find(functionsInfo, {'name': functionName});
        return _prepFunctionOp(functionInfo).then(function(functionTrigger) {
          utils.logBullet(chalk.bold.cyan('functions: ') + 'creating function ' + chalk.bold(functionName) + '...');
          logger.debug('Trigger is: ', functionTrigger);
          var eventType = functionTrigger.eventTrigger ? functionTrigger.eventTrigger.eventType : 'https';
          _startTimer(functionName, 'create');

          deployments.push({
            functionName: functionName,
            retryFunction: gcp.cloudfunctions.create,
            retryParams: {
              projectId: projectId,
              region: GCP_REGION,
              eventType: eventType,
              functionName: functionName,
              entryPoint: functionInfo.entryPoint,
              trigger: functionTrigger,
              sourceArchiveUrl: sourceUrl
            }
          });
        });
      }).value();

    var updateOps = _.chain(uploadedNames)
      .intersection(existingNames)
      .intersection(releaseNames)
      .map(function(functionName) {
        var functionInfo = _.find(functionsInfo, {'name': functionName});
        return _prepFunctionOp(functionInfo, functionName).then(function(functionTrigger) {
          utils.logBullet(chalk.bold.cyan('functions: ') + 'updating function ' + chalk.bold(functionName) + '...');
          logger.debug('Trigger is: ', functionTrigger);
          var existingFunction = _.find(existingFunctions, function(func) {
            return func.name.match(new RegExp('/' + functionName + '$'));
          });
          _startTimer(functionName, 'update');
          // Also provide `availableMemory` and `timeout` retrieved from `gcp.cloudfunctions.list`
          // This is a stop gap until GCF bug is fixed BUG(36844999)
          deployments.push({
            functionName: functionName,
            retryFunction: gcp.cloudfunctions.update,
            retryParams: {
              projectId: projectId,
              region: GCP_REGION,
              functionName: functionName,
              entryPoint: functionInfo.entryPoint,
              trigger: functionTrigger,
              sourceArchiveUrl: sourceUrl,
              availableMemory: existingFunction.availableMemoryMb,
              functionTimeout: existingFunction.timeout
            }
          });
        });
      }).value();

    // If not using function filters, then `deleteReleaseNames` should be equivalent to existingNames so that intersection is a noop
    var deleteReleaseNames = functionFilterGroups.length > 0 ? releaseNames : existingNames;

    var deleteOps = _.chain(existingFunctions)
      .filter(function(o) {
        return o.sourceArchiveUrl === sourceUrl || o.sourceArchiveUrl === legacySourceUrl;
      }) // only delete functions uploaded via firebase-tools
      .map(pluckName)
      .difference(uploadedNames)
      .intersection(deleteReleaseNames)
      .map(function(functionName) {
        utils.logBullet(chalk.bold.cyan('functions: ') + 'deleting function ' + chalk.bold(functionName) + '...');
        _startTimer(functionName, 'delete');
        deployments.push({
          functionName: functionName,
          retryFunction: gcp.cloudfunctions.delete,
          retryParams: {
            projectId: projectId,
            region: GCP_REGION,
            functionName: functionName
          }
        });
      }).value();

    return RSVP.all([].concat(createOps, updateOps, deleteOps)).then(function() {
      return RSVP.allSettled(_.map(deployments, function(op) {
        return op.retryFunction(op.retryParams).then(function(res) {
          return _.merge(op, res);
        });
      }));
    });
  }).then(function(allOps) {
    var failedCalls = _.chain(allOps).filter({'state': 'rejected'}).map('reason').value();
    var successfulCalls = _.chain(allOps).filter({'state': 'fulfilled'}).map('value').value();
    failedDeployments += failedCalls.length;

    return _fetchTriggerUrls(successfulCalls).then(function() {
      return pollAndManageOperations(successfulCalls).catch(function() {
        utils.logWarning(chalk.bold.yellow('functions:') + ' failed to get status of all the deployments');
        logger.info('You can check on their status at ' + utils.consoleUrl(options.project, '/functions/logs'));
        return RSVP.reject(new FirebaseError('Failed to get status of functions deployments.'));
      });
    }).then(function() {
      track('Functions Deploy (Result)', 'failure', failedDeployments);
      track('Functions Deploy (Result)', 'success', deployments.length - failedDeployments);

      if (failedDeployments > 0) {
        logger.info('\n\nFunctions deploy had errors. To continue deploying other features (such as database), run:');
        logger.info('    ' + chalk.bold('firebase deploy --except functions'));
        return RSVP.reject(new FirebaseError('Functions did not deploy properly.'));
      }
    });
  });
};
