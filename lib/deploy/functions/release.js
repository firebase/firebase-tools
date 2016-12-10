'use strict';

var _ = require('lodash');
var utils = require('../../utils');
var gcp = require('../../gcp');
var RSVP = require('rsvp');
var logger = require('../../logger');
var FirebaseError = require('../../error');
var chalk = require('chalk');
var api = require('../../api');

module.exports = function(context, options, payload) {
  if (!options.config.has('functions')) {
    return RSVP.resolve();
  }

  var POLL_INTERVAL = 5000; // 5 sec
  var PROVIDER_SERVICE_ACCOUNT = utils.envOverride('FIREBASE_PROVIDER_SERVICE_ACCOUNT', '176829341474-s3rdr7brhks3ihq8735pcih7sbpdkdvv@developer.gserviceaccount.com');
  var GCP_REGION = 'us-central1';
  var projectId = context.projectId;
  var bucketName = gcp.storage.buckets.name(projectId);
  var sourceUrl = 'gs://' + bucketName + '/' + projectId;

  var functionsInfo = payload.functions.triggers;

  function _fetchTriggerUrls(ops) {
    return gcp.cloudfunctions.list(projectId, GCP_REGION).then(function(functions) {
      var httpFunctions = _.chain(functions).filter({ gcsUrl: sourceUrl}).filter('httpsTrigger').value();
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
    if (failedCalls.length > 0) {
      failed = true;
      utils.logWarning(chalk.bold.yellow('functions: ') + failedCalls.length + ' function(s) failed to be deployed.');
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

  function _pollOperations(successfulCalls) {
    function logOps(ops) {
      _.forEach(ops, function(operation) {
        var parts = operation.func.split('/');
        var functionName = parts[5];
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
          return gcp.cloudfunctions.check(operation);
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

  function _putDatabaseTriggers() {
    var endpoint = 'https://' + options.instance + '.firebaseio.com/.settings/functionTriggers.json';
    var databaseTriggers = functionsInfo.filter(function(functionInfo) {
      return functionInfo.service === 'firebase.database';
    }).map(function(functionInfo) {
      return _.omit(functionInfo, 'service');
    });
    if (_.isEmpty(databaseTriggers)) {
      return RSVP.resolve();
    }
    return api.request('PUT', endpoint, {
      auth: true,
      data: databaseTriggers,
      headers: {'Content-Type': 'application/json'},
      origin: ''
    }).catch(function(err) {
      utils.logWarning(chalk.bold.yellow('functions: ') + 'failed to upload triggers. ' + err.message);
      return RSVP.reject();
    });
  }

  function _prepFunctionOp(functionInfo, functionName) {
    var functionTrigger;
    switch (functionInfo.service) {
    case 'firebase.database':
      var topicPath;
      return gcp.pubsub.topics.acquire(projectId, functionName).then(function(topic) {
        topicPath = topic;
        return gcp.pubsub.topics.addPublisher(projectId, functionName, PROVIDER_SERVICE_ACCOUNT);
      }).then(function() {
        functionTrigger = {pubsubTrigger: topicPath};
        return RSVP.resolve(functionTrigger);
      });
    case 'cloud.pubsub':
      var topicName = functionInfo.topic;
      return gcp.pubsub.topics.acquire(projectId, topicName).then(function(topic) {
        functionTrigger = {pubsubTrigger: topic};
        return RSVP.resolve(functionTrigger);
      });
    case 'cloud.storage':
      var bucket = functionInfo.bucket;
      if (!bucket) {
        bucket = _.get(context, 'firebaseConfig.storageBucket');
      }
      functionTrigger = {gcsTrigger: 'gs://' + bucket + '/'};
      return RSVP.resolve(functionTrigger);
    case 'cloud.http':
      functionTrigger = {httpsTrigger: {}};
      return RSVP.resolve(functionTrigger);
    default:
      return RSVP.reject();
    }
  }

  delete payload.functions;
  var uploadedNames = _.map(functionsInfo, 'name');

  return _putDatabaseTriggers().then(function() {
    return gcp.cloudfunctions.list(projectId, GCP_REGION);
  }).then(function(existingFunctions) {
    var existingNames = _.map(existingFunctions, 'functionName');

    var addOps = _.chain(uploadedNames)
      .difference(existingNames)
      .map(function(functionName) {
        var functionInfo = _.find(functionsInfo, {'name': functionName});
        return _prepFunctionOp(functionInfo, functionName).then(function(functionTrigger) {
          utils.logBullet(chalk.bold.cyan('functions: ') + 'creating function ' + chalk.bold(functionName) + '...');
          return gcp.cloudfunctions.create(projectId, GCP_REGION, functionName, functionInfo.entryPoint, functionTrigger, sourceUrl);
        });
      }).value();

    var updateOps = _.chain(uploadedNames)
      .intersection(existingNames)
      .map(function(functionName) {
        var functionInfo = _.find(functionsInfo, {'name': functionName});
        return _prepFunctionOp(functionInfo, functionName).then(function(functionTrigger) {
          utils.logBullet(chalk.bold.cyan('functions: ') + 'updating function ' + chalk.bold(functionName) + '...');
          return gcp.cloudfunctions.update(projectId, GCP_REGION, functionName, functionInfo.entryPoint, functionTrigger, sourceUrl);
        });
      }).value();

    var deleteOps = _.chain(existingFunctions)
      .filter({ gcsUrl: sourceUrl }) // only delete functions uploaded via firebase-tools
      .map('functionName')
      .difference(uploadedNames)
      .map(function(functionName) {
        utils.logBullet(chalk.bold.cyan('functions: ') + 'deleting function ' + chalk.bold(functionName) + '...');
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
  }).catch(function() {
    logger.info('\n\nFunctions deploy had errors. To continue deploying other features (such as database), run:');
    logger.info('    ' + chalk.bold('firebase deploy --except functions'));
    return RSVP.reject(new FirebaseError('Functions did not deploy properly.'));
  });
};
