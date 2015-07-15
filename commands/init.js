'use strict';
var Command = require('../lib/command');
var prompt = require('../lib/prompt');
var fs = require('fs');
var path = require('path');
var defaultConfig = require('../templates/firebase.json');
var _ = require('lodash');
var logger = require('../lib/logger');
var homeDir = require('user-home');

module.exports = new Command('init')
  .description('setup a Firebase app in the current directory')
  .option('-f, --firebase <firebase>', 'the name of the firebase to use')
  .option('-p, --public <dir>', 'the name of your app\'s public directory')
  .action(function(options, resolve) {
    var cwd = process.cwd();

    if (path.relative(homeDir, cwd).match(/^\.\./)) {
      logger.warn('Initializing outside your home directory');
    }
    if (cwd === homeDir) {
      logger.warn('Initializing directly at your home directory');
    }
    var emptyDir = fs.readdirSync(cwd).length === 0;
    if (!emptyDir) {
      logger.warn('Initializing in a non-empty directory');
    }
    if (fs.existsSync(path.join(cwd, 'firebase.json'))) {
      logger.warn('firebase.json already present, will be overwritten by this command');
    }

    prompt(options, [
      {
        type: 'input',
        name: 'firebase',
        message: 'What Firebase do you want to use?',
        validate: function(answer) {
          if (!answer.match(/^[a-z0-9-]+$/)) {
            return 'Invalid Firebase name';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'public',
        message: 'What directory should be your public dir?',
        'default': '.',
        validate: function(answer) {
          if (!fs.existsSync(path.resolve(cwd, answer))) {
            return 'Public directory must already exist';
          }
          return true;
        },
        filter: function(input) {
          input = path.relative(cwd, input);
          if (input === '') { input = '.'; }
          return input;
        }
      }
    ], function() {
      var config = JSON.stringify(_.extend(defaultConfig, {
        firebase: options.firebase,
        'public': options.public
      }), undefined, 2);
      fs.writeFileSync(path.join(cwd, 'firebase.json'), config);
      logger.info('Firebase initialized, configuration written to firebase.json');
      resolve();
    });
  });
