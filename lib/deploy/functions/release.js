'use strict';

var chalk = require('chalk');
var _ = require('lodash');
var RSVP = require('rsvp');

var FirebaseError = require('../../error');
var gcp = require('../../gcp');
var logger = require('../../logger');
var track = require('../../track');
var utils = require('../../utils');

module.exports = function(context, options, payload) {
  if (!options.config.has('functions')) {
    return RSVP.resolve();
  }

  var POLL_INTERVAL = 5000; // 5 sec
  var GCP_REGION = 'us-central1';
  var projectId = context.projectId;
  var sourceUrl = 'gs://' + context.functionsBucket + '/' + gcp.storage.archiveName;
  var legacySourceUrl = 'gs://' + projectId + '-gcf/' + projectId;

  var functionsInfo = payload.functions.triggers;
  var timings = {};

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
    return gcp.cloudfunctions.list(projectId, GCP_REGION).then(function(functions) {
      var httpFunctions = _.chain(functions).filter({ sourceArchiveUrl: sourceUrl}).filter('httpsTrigger').value();
      _.forEach(httpFunctions, function(httpFunc) {
        _.chain(ops).find({ func: httpFunc.name }).assign({ triggerUrl: httpFunc.httpsTrigger.url}).value();
      });
      return RSVP.resolve();
    });
  }

  function _reportResults(successfulCalls, failedCalls) {
    function logFailedOps(ops) {
      _.forEach(ops, function(operation) {
        var parts = operation.func.split('/');
        var functionName = parts[5];
        utils.logWarning(chalk.bold.yellow('functions[' + functionName + ']: ') + 'Deploy Error: ' + operation.error.message);
      });
    }

    function logSuccessfulOps(ops) {
      var functionUrls = [];
      _.forEach(ops, function(operation) {
        var parts = operation.func.split('/');
        var functionName = parts[5];
        if (operation.triggerUrl && operation.type !== 'delete') {
          var entry = { 'funcName': functionName, 'url': operation.triggerUrl};
          functionUrls = _.concat(functionUrls, entry);
        }
        utils.logSuccess(chalk.bold.green('functions[' + functionName + ']: ') + 'Successful ' + operation.type + ' operation. ');
        if (operation.type === 'create' && operation.eventType.startsWith('providers/google.firebase.analytics/')) {
          utils.logWarning(chalk.bold.yellow('functions[' + functionName + ']: during beta, new Analytics functions may take a few hours to start receiving events.'));
        }
      });

      if (functionUrls.length > 0) {
        _.set(context, 'functionUrls', functionUrls);
      }
    }

    var failedChecks = _.filter(successfulCalls, function(op) {
      return !op.done && op.error;
    });
    var failedOps = _.filter(successfulCalls, function(op) {
      return op.done && op.error;
    });
    var successfulOps = _.filter(successfulCalls, function(op) {
      return op.done && !op.error;
    });

    var failed = false;

    var failCount = failedOps.length + failedCalls.length;
    track('Functions Deploy (Result)', 'failure', failCount.length || 0);
    track('Functions Deploy (Result)', 'success', successfulOps.length || 0);

    if (failedCalls.length > 0) {
      failed = true;
      utils.logWarning(chalk.bold.yellow('functions: ') + failedCalls.length + ' function(s) failed to be deployed.');
      logger.debug(failedCalls);
    }
    if (failedOps.length > 0) {
      failed = true;
      logFailedOps(failedOps);
    }
    if (failedChecks.length > 0) {
      utils.logWarning(chalk.bold.yellow('functions: ') + 'failed to get status of ' + failedChecks.length + ' operation(s).');
      utils.logWarning(chalk.bold.yellow('functions: ') + 'run ' + chalk.bold('firebase functions:log') + ' in a few minutes to ensure that your functions deployed properly.');
    }
    if (successfulOps.length > 0) {
      logSuccessfulOps(successfulOps);
      if (!failed) {
        utils.logSuccess(chalk.bold.green('functions: ') + 'all functions deployed successfully!');
      } else {
        utils.logSuccess(chalk.bold.green('functions: ') + successfulOps.length + ' function(s) deployed successfully.');
      }
    }
    return failed ? RSVP.reject() : RSVP.resolve();
  }

  function _nameFromOperation(operation) {
    if (!operation || !_.isString(operation.func)) {
      return null;
    }

    return operation.func.split('/')[5];
  }

  function _pollOperations(successfulCalls) {
    function logOps(ops) {
      _.forEach(ops, function(operation) {
        var functionName = _nameFromOperation(operation);
        var msg = '[functions] operation poll: '
          + functionName + ': '
          + operation.type + ' ' + operation.name + ' is '
          + (operation.done ? 'done.' : 'not done.');
        logger.debug(msg);
      });
    }
    return new RSVP.Promise(function(resolve, reject) {
      function poll() {
        var unfinishedOps = _.chain(successfulCalls).filter(function(operation) {
          return !(operation.done || operation.error);
        }).map(function(operation) {
          return gcp.cloudfunctions.check(operation).then(function(op) {
            var name = _nameFromOperation(op);
            if (name && op.done) {
              _endTimer(name);
            }
            return op;
          });
        }).value();

        if (unfinishedOps.length === 0) {
          return resolve();
        }

        RSVP.allSettled(unfinishedOps).then(function(checks) {
          var successfulChecks = _.chain(checks).filter({'state': 'fulfilled'}).map('value').value();
          logOps(successfulChecks);

          var allDone = _.every(successfulChecks, { done: true });
          if (allDone) {
            return resolve();
          }
          setTimeout(poll, POLL_INTERVAL);
        }).catch(function(err) {
          return reject(err);
        });
      }
      poll();
    });
  }

  function _prepFunctionOp(functionInfo) {
    if (functionInfo.httpsTrigger) {
      return RSVP.resolve(_.pick(functionInfo, 'httpsTrigger'));
    } else if (functionInfo.eventTrigger) {
      var trigger = functionInfo.eventTrigger;
      if (trigger.eventType === 'providers/cloud.storage/eventTypes/object.change' && !trigger.resource) {
        var bucket = _.get(context, 'firebaseConfig.storageBucket');
        _.set(trigger, 'resource', 'projects/_/buckets/' + bucket);
      }
      return RSVP.resolve({eventTrigger: trigger});
    }
    logger.debug('Unknown trigger type found in:', functionInfo);
    return RSVP.reject(new Error('Could not parse function trigger, unknown trigger type.'));
  }

  delete payload.functions;
  var uploadedNames = _.map(functionsInfo, 'name');

  return gcp.cloudfunctions.list(projectId, GCP_REGION).then(function(existingFunctions) {
    var pluckName = function(functionObject) {
      var fullName = _.get(functionObject, 'name'); // e.g.'projects/proj1/locations/us-central1/functions/func'
      return _.last(fullName.split('/'));
    };

    var existingNames = _.map(existingFunctions, pluckName);

    var addOps = _.chain(uploadedNames)
      .difference(existingNames)
      .map(function(functionName) {
        var functionInfo = _.find(functionsInfo, {'name': functionName});
        return _prepFunctionOp(functionInfo).then(function(functionTrigger) {
          utils.logBullet(chalk.bold.cyan('functions: ') + 'creating function ' + chalk.bold(functionName) + '...');
          logger.debug('Trigger is: ', functionTrigger);
          var eventType = functionTrigger.eventTrigger ? functionTrigger.eventTrigger.eventType : 'https';
          _startTimer(functionName, 'create');
          return gcp.cloudfunctions.create(projectId, GCP_REGION, eventType, functionName, functionInfo.entryPoint, functionTrigger, sourceUrl);
        });
      }).value();

    var updateOps = _.chain(uploadedNames)
      .intersection(existingNames)
      .map(function(functionName) {
        var functionInfo = _.find(functionsInfo, {'name': functionName});
        return _prepFunctionOp(functionInfo, functionName).then(function(functionTrigger) {
          utils.logBullet(chalk.bold.cyan('functions: ') + 'updating function ' + chalk.bold(functionName) + '...');
          logger.debug('Trigger is: ', functionTrigger);
          var existingFunction = _.find(existingFunctions, function(func) {
            return func.name.match(new RegExp('/' + functionName + '$'));
          });
          var existingTriggerType = _.get(existingFunction, 'eventTrigger.eventType');
          var newTriggerType = _.get(functionTrigger, 'eventTrigger.eventType');
          var isNowDBTrigger = newTriggerType === 'providers/google.firebase.database/eventTypes/ref.write';
          // Firebase Database triggers could be outdated in 2 ways: they are still a PubSub trigger, or their event
          // type contains 'data.write' instead of 'ref.write'. GCF won't allow us to change the trigger type of an existing trigger
          // so we have to delete functions that were based on the old prototype and create them as real database triggers.
          if (isNowDBTrigger && newTriggerType !== existingTriggerType) {
            return gcp.cloudfunctions.delete(projectId, GCP_REGION, functionName)
              .then(function(call) {
                return _pollOperations([call]);
              }).then(function() {
                return gcp.cloudfunctions.create(
                  projectId,
                  GCP_REGION,
                  functionName,
                  functionInfo.entryPoint,
                  functionTrigger, sourceUrl);
              });
          }
          _startTimer(functionName, 'update');
          return gcp.cloudfunctions.update(projectId, GCP_REGION, functionName, functionInfo.entryPoint, functionTrigger, sourceUrl);
        });
      }).value();


    var deleteOps = _.chain(existingFunctions)
      .filter(function(o) {
        return o.sourceArchiveUrl === sourceUrl || o.sourceArchiveUrl === legacySourceUrl;
      }) // only delete functions uploaded via firebase-tools
      .map(pluckName)
      .difference(uploadedNames)
      .map(function(functionName) {
        utils.logBullet(chalk.bold.cyan('functions: ') + 'deleting function ' + chalk.bold(functionName) + '...');
        _startTimer(functionName, 'delete');
        return gcp.cloudfunctions.delete(projectId, GCP_REGION, functionName);
      }).value();
    return RSVP.allSettled([].concat(addOps, updateOps, deleteOps));
  }).then(function(allOps) {
    var failedCalls = _.chain(allOps).filter({'state': 'rejected'}).map('reason').value();
    var successfulCalls = _.chain(allOps).filter({'state': 'fulfilled'}).map('value').value();
    var fetch =  _fetchTriggerUrls(successfulCalls);
    var poll = _pollOperations(successfulCalls);

    return RSVP.allSettled([fetch, poll]).then(function() {
      return _reportResults(successfulCalls, failedCalls);
    });
  }).catch(function(e) {
    logger.info('\n\nFunctions deploy had errors. To continue deploying other features (such as database), run:');
    logger.info('    ' + chalk.bold('firebase deploy --except functions'));
    if (e) {
      logger.debug(e.stack);
    }
    return RSVP.reject(new FirebaseError('Functions did not deploy properly.'));
  });
};
