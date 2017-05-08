'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');
var getProjectId = require('../getProjectId');
var utils = require('../utils');
var parseTriggersEmulator = require('../parseTriggersEmulator');
var functionsConfig = require('../functionsConfig');
var EmulatorController;
var controller;

function _pollOperation(op) {
  return new RSVP.Promise(function(resolve, reject) {
    var poll = function() {
      controller.client.getOperation(op[0].name)
        .then(function(results) {
          var operation = results[0];
          if (operation.done) {
            if (operation.response) {
              resolve(operation.response.value);
            } else {
              reject(operation.error || new Error('Deployment failed'));
            }
          } else {
            setTimeout(poll, 500);
          }
        })
        .catch(reject);
    };
    poll();
  });
}

function _stopEmulator() {
  return new RSVP.Promise(function(resolve) {
    if (controller) {
      controller.stop().then(resolve);
      // Force-kill controller after 0.5 s
      setInterval(function() {
        controller.kill().then(resolve);
      }, 500);
    } else {
      resolve();
    }
  });
}

function _getPorts(options) {
  var portsConfig = {
    restPort: options.port,
    grpcPort: options.port + 1,
    supervisorPort: options.port + 2
  };
  if (_.includes(options.targets, 'hosting')) {
    return _.mapValues(portsConfig, function(port) {
      return port + 1; // bump up port numbers by 1 so hosting can be served on first port
    });
  }
  return portsConfig;
}

function _startEmulator(options) {
  try {
    EmulatorController = require('@google-cloud/functions-emulator/src/cli/controller');
  } catch (err) {
    var msg = err;
    if (process.version !== 'v6.9.1') {
      msg = 'Please use Node version v6.9.1, you have ' + process.version + '\n';
    }
    utils.logWarning(chalk.yellow('functions:') + ' Cannot start emulator. ' + msg);
    return RSVP.reject();
  }
  if (process.version !== 'v6.9.1') {
    utils.logWarning(chalk.yellow('functions:') + ' The emulator works best with Node version v6.9.1, you have ' + process.version + '\n');
  }
  var functionsDir = path.join(options.config.projectDir, options.config.get('functions.source'));
  var projectId = getProjectId(options);
  var controllerConfig = _.merge({tail: true, projectId: projectId}, _getPorts(options));
  controller = new EmulatorController(controllerConfig);
  var firebaseConfig;

  return functionsConfig.getFirebaseConfig(projectId, options.instance)
  .then(function(result) {
    firebaseConfig = JSON.stringify(result);
    return controller.start({
      detached: false,
      stdio: ['ignore', process.stdout, process.stderr],
      env: {
        FIREBASE_PROJECT: firebaseConfig,
        DB_NAMESPACE: options.instance
      }
    });
  }).then(function() {
    return controller.clear().catch(_.noop); // undeploys previously locally deployed functions
  }).then(function() {
    return parseTriggersEmulator(firebaseConfig, projectId, options.instance, functionsDir);
  // TODO: display better formatted message when there are errors from trigger parsing
  }).then(function(triggers) {
    var promises = _.map(triggers, function(trigger) {
      if (trigger.httpsTrigger) {
        return controller.deploy(trigger.name, {
          localPath: functionsDir,
          triggerHttp: true
        }).catch(function() {
          return RSVP.reject({name: trigger.name});
        });
      }
      return RSVP.resolve(); // TODO: support other trigger types
    });
    return RSVP.allSettled(promises);
  }).then(function(operations) {
    var functionUrls = {};
    return RSVP.all(_.map(operations, function(operation) {
      if (operation.state === 'rejected') {
        utils.logWarning(chalk.yellow('functions:') + ' Failed to emulate ' + operation.reason.name +
          '. Please note functions.config() is not yet supported.');
        return RSVP.resolve();
      }
      if (!operation.value) {
        return RSVP.resolve(); // it was a non-HTTPS trigger
      }
      return _pollOperation(operation.value).then(function(res) {
        var funcName = _.chain(res).get('name').split('/').last().value();
        functionUrls[funcName] = res.httpsTrigger.url;
      });
    })).then(function() {
      return functionUrls;
    });
  }).then(function(functionUrls) {
    if (_.size(functionUrls) === 0) {
      utils.logBullet(chalk.cyan.bold('functions: ') + 'No HTTPS functions emulated. ' +
        'Support for other function types are coming soon.');
      return;
    }
    _.forEach(functionUrls, function(url, funcName) {
      utils.logSuccess(chalk.green.bold('functions: ') + funcName + ': ' + chalk.bold(url));
    });
  }).catch(function(e) {
    utils.logWarning(chalk.yellow('functions:') + ' Error from emulator. ' + e.stack);
    return _stopEmulator();
  });
}

module.exports = {
  start: _startEmulator,
  stop: _stopEmulator
};
