'use strict';

var _ = require('lodash');
var fs = require('fs');
var RSVP = require('rsvp');
var utils = require('../utils');
var chalk = require('chalk');
var childProcess = require('child_process');
var FirebaseError = require('../error');
var getProjectId = require('../getProjectId');
var logger = require('../logger');

var checkAndRemoveEmptyCommands = function(commands, jsonFile) {
  var checkedCommands = [];
  for (var index = 0; index < commands.length; index++) {
    var command = commands[index].split(' ');
    var npmIndex = command.indexOf('npm');
    var runIndex = command.indexOf('run');
    // if command is of type npm run
    if (npmIndex > -1 && runIndex > -1 && npmIndex < runIndex) {
      // assuming word after run is script to be run
      var script = command[runIndex + 1];
      if (!!jsonFile.scripts[script]) {
        checkedCommands.push(commands[index]);
      }
    }
  }
  return checkedCommands;
};

var runCommand = function(command, childOptions) {
  return new Promise(function(resolve, reject) {
    logger.info('Running command: ' + command);
    if (command === '') {
      resolve();
    }
    var child = childProcess.spawn(command, [], childOptions);
    child.on('error', function(err) {
      reject(err);
    });
    child.on('exit', function(code, signal) {
      if (signal) {
        reject(new Error('Command terminated with signal ' + signal));
      } else if (code !== 0) {
        reject(new Error('Command terminated with non-zero exit code' + code));
      } else {
        resolve();
      }
    });
  });
};

var run = function(target, hook) {
  // Errors in postdeploy script will not exit the process since it's too late to stop the deploy.
  var exit = hook !== 'postdeploy' ? undefined : {exit: 2};

  return function(context, options) {
    var commands  = options.config.get(target + '.' + hook);

    if (!commands) {
      return RSVP.resolve();
    }
    if (typeof commands === 'string') {
      commands = [commands];
    }

    // active project ID
    var projectId = getProjectId(options);
    // root directory where firebase.json can be found
    var projectDir = options.projectRoot;
    // location of hosting site or functions deploy, defaults project directory
    var resourceDir;
    switch (target) {
    case 'hosting':
      resourceDir = options.config.path(options.config.get('hosting.public'));
      break;
    case 'functions':
      resourceDir = options.config.path(options.config.get('functions.source'));
      break;
    default:
      resourceDir = options.config.path(options.config.projectDir);
    }

    var json = JSON.parse(fs.readFileSync(resourceDir + '/package.json', 'utf8'));
    var checked = checkAndRemoveEmptyCommands(commands, json);

    // Copying over environment variables
    var childEnv = _.assign({}, process.env, {
      GCLOUD_PROJECT: projectId,
      PROJECT_DIR: projectDir,
      RESOURCE_DIR: resourceDir
    });

    var childOptions = {
      cwd: options.config.projectDir,
      env: childEnv,
      shell: true,
      stdio: [0, 1, 2] // Inherit STDIN, STDOUT, and STDERR
    };

    var runAllCommands = _.reduce(checked, function(soFar, command) {
      return soFar.then(function() {
        return runCommand(command, childOptions);
      });
    }, Promise.resolve());

    return runAllCommands.then(function() {
      utils.logSuccess(chalk.green.bold(target + ':') + ' Finished running ' + chalk.bold(hook) + ' script.');
    }).catch(function(err) {
      throw new FirebaseError(target + ' ' + hook + ' error: ' + err.message, exit);
    });
  };
};

var lifecycleHooks = {
  run: run,
  checkCommands: checkAndRemoveEmptyCommands
};

module.exports = lifecycleHooks;

