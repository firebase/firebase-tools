'use strict';
var Command = require('../lib/command');
var Config = require('../lib/config');
var prompt = require('../lib/prompt');
var fs = require('fs-extra');
var fsutils = require('../lib/fsutils');
var path = require('path');
var defaultConfig = require('../templates/firebase.json');
var _ = require('lodash');
var logger = require('../lib/logger');
var homeDir = require('user-home');
var chalk = require('chalk');
var api = require('../lib/api');
var requireAuth = require('../lib/requireAuth');
var RSVP = require('rsvp');
var FirebaseError = require('../lib/error');
var utils = require('../lib/utils');

var NEW_PROJECT = '[create a new project]';

var _isOutside = function(from, to) {
  return path.relative(from, to).match(/^\.\./);
};

module.exports = new Command('init')
  .description('set up a Firebase app in the current directory')
  .option('-p, --public <dir>', 'the name of your app\'s public directory')
  .before(requireAuth)
  .action(function(options) {
    var cwd = options.cwd || process.cwd();

    if (_isOutside(homeDir, cwd)) {
      utils.logWarning(chalk.bold.yellow('Caution!') + ' Initializing outside your home directory');
    }
    if (cwd === homeDir) {
      utils.logWarning(chalk.bold.yellow('Caution!') + ' Initializing directly at your home directory');
    }

    var config = Config.load(options, true);
    if (config) {
      return RSVP.reject(new FirebaseError('Cannot run init, already inside a project directory:\n\n' + chalk.bold(config.projectDir)));
    }

    var fileCount = _.difference(fs.readdirSync(cwd), ['firebase-debug.log']).length;
    if (fileCount !== 0) {
      utils.logWarning('Initializing in a directory with ' + chalk.bold(fileCount) + ' files');
      logger.warn();
    }

    return api.getProjects().then(function(projects) {
      var projectIds = Object.keys(projects).sort();
      var nameOptions = [NEW_PROJECT].concat(projectIds);

      return prompt(options, [
        {
          type: 'list',
          name: 'project',
          message: 'What Firebase do you want to use?',
          validate: function(answer) {
            if (!_.contains(nameOptions, answer)) {
              return 'Must specify a Firebase to which you have access';
            }
            return true;
          },
          choices: nameOptions
        },
        {
          type: 'input',
          name: 'public',
          message: 'What directory should be the public root?',
          default: 'public',
          validate: function(answer) {
            if (_isOutside(cwd, answer)) {
              return 'Must be within the current directory';
            }
            return true;
          },
          filter: function(input) {
            input = path.relative(cwd, input);
            if (input === '') { input = '.'; }
            return input;
          },
          when: function(answers) {
            return answers.project !== NEW_PROJECT;
          }
        }
      ]).then(function() {
        if (options.project === NEW_PROJECT) {
          logger.info('Please visit', chalk.underline('https://firebase.google.com'), 'to create a new project, then run', chalk.bold('firebase init'), 'again.');
          return RSVP.resolve();
        }
        var absPath = path.resolve(cwd, options.public || '.');
        if (!fsutils.dirExistsSync(absPath)) {
          fs.mkdirsSync(absPath);
          logger.info(chalk.green('✔ '), 'Public directory', chalk.bold(options.public), 'has been created');
        }

        var publicPath = path.relative(cwd, options.public);
        if (publicPath === '') {
          publicPath = '.';
        }
        var out = JSON.stringify(_.extend({}, defaultConfig, {
          firebase: options.project,
          public: publicPath
        }), undefined, 2);

        fs.writeFileSync(path.join(cwd, 'firebase.json'), out);
        logger.info('Firebase initialized, configuration written to firebase.json');
        return path.resolve(path.join(cwd, 'firebase.json'));
      });
    });
  });
