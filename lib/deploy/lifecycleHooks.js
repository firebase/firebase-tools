'use strict';

var _ = require('lodash');
var RSVP = require('rsvp');
var utils = require('../utils');
var chalk = require('chalk');
var cprocess = require('child_process');
var FirebaseError = require('../error');
var getProjectId = require('../getProjectId');

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

    // active project ID
    process.env.GCLOUD_PROJECT = getProjectId(options);    
    // root directory where firebase.json can be found
    process.env.PROJECT_DIR = options.projectRoot;
    // location of hosting site
    if (target === 'hosting') {
       process.env.RESOURCE_DIR = options.config.path(options.config.get('hosting').public);
    }
    // location of functions deploy
    if (target === 'functions') {
       process.env.RESOURCE_DIR = options.config.path(options.config.get('functions.source'));
    }

    var runAllCommands = _.reduce(commands, function(soFar, command){
      return (soFar).then(function() {
        return runCommand(command, {cwd: options.config.projectDir});
      }).then(function() {

      });
    }, Promise.resolve());

    //TODO: remove process environment variables?

    return runAllCommands.then(function() {
      utils.logSuccess(chalk.green.bold(target + ':') + ' Finished running ' + chalk.bold(hook) + ' script.');
      delete process.env.GCLOUD_PROJECT;
      delete process.env.PROJECT_DIR;
      delete process.env.RESOURCE_DIR;
    }).catch(function(err) {
     throw new FirebaseError(target + ' ' + hook + ' error: ' + err.message, exit);
   });
    
  };
}

function runCommand(command, options) {
  return new Promise((resolve, reject) => { 
    var child = cprocess.spawn(command, _.assign({}, options,{
      shell: true,
      stdio: [0, 1, 2], // Inherit STDIN, STDOUT, and STDERR
      env: process.env
    })
  );
    console.log(child);
    console.log('Running command: ' + command);
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



