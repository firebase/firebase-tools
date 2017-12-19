'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var utils = require('../utils');
var chalk = require('chalk');
var process = require('child_process');
var FirebaseError = require('../error');

module.exports = function(target, hook) {
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

    var runAllCommands = _.reduce(commands, function(soFar, command){
      return (soFar).then(function() {
        return runCommand(command, {cwd: options.config.projectDir});
      });
    }, Promise.resolve());

    return runAllCommands.then(function() {
      utils.logSuccess(chalk.green.bold(target + ':') + ' Finished running ' + chalk.bold(hook) + ' script.');
    }).catch(function(err) {
     throw new FirebaseError(target + ' ' + hook + ' error: ' + err.message, exit);
   });
    
  };
}

function runCommand(command, options) {
  return new Promise((resolve, reject) => { 
    var child = process.spawn(command, [], _.assign({}, options,{
      shell: true,
      stdio: [0, 1, 2] // Inherit STDIN, STDOUT, and STDERR
      })
    );
    console.log("running script: ", command);
    child.on('error', function(err) {
      reject(new Error(error));
    });

    child.on('exit', function(code, signal) {
      if (signal !== null) {
        reject(new Error('command terminated with signal ' + signal));
      } else if (code) {
        reject(new Error('command terminated with non-zero exit code' + code));
      } else {
        resolve();
      }
    });
  });
}



