'use strict';

var chalk = require('chalk');
var fs = require('fs');
var homeDir = require('user-home');
var path = require('path');
var RSVP = require('rsvp');

var Command = require('../lib/command');
var Config = require('../lib/config');
var init = require('../lib/init');
var logger = require('../lib/logger');
var prompt = require('../lib/prompt');
var requireAuth = require('../lib/requireAuth');
var utils = require('../lib/utils');

var BANNER_TEXT = fs.readFileSync(__dirname + '/../templates/banner.txt', 'utf8');

var _isOutside = function(from, to) {
  return path.relative(from, to).match(/^\.\./);
};

module.exports = new Command('init [feature]')
  .description('setup a Firebase project in the current directory')
  .before(requireAuth)
  .action(function(feature, options) {
    var cwd = options.cwd || process.cwd();

    var warnings = [];
    var warningText = '';
    if (_isOutside(homeDir, cwd)) {
      warnings.push('You are currently outside your home directory');
    }
    if (cwd === homeDir) {
      warnings.push('You are initializing your home directory as a Firebase project');
    }

    var config = Config.load(options, true);
    var existingConfig = !!config;
    if (!existingConfig) {
      config = new Config({}, {projectDir: cwd, cwd: cwd});
    } else {
      warnings.push('You are initializing in an existing Firebase project directory');
    }

    if (warnings.length) {
      warningText = '\nBefore we get started, keep in mind:\n\n  ' + chalk.yellow.bold('* ') + warnings.join('\n  ' + chalk.yellow.bold('* ')) + '\n';
    }

    if (process.platform === 'darwin') {
      BANNER_TEXT = BANNER_TEXT.replace(/#/g, '🔥');
    }
    logger.info(chalk.yellow.bold(BANNER_TEXT) +
      '\nYou\'re about to initialize a Firebase project in this directory:\n\n  ' + chalk.bold(config.projectDir) + '\n' +
      warningText
    );

    var setup = {
      config: config._src,
      rcfile: config.readProjectFile('.firebaserc', {
        json: true,
        fallback: {}
      })
    };

    var choices = [
      {name: 'database', label: 'Database: Deploy Firebase Realtime Database Rules', checked: false},
      {name: 'firestore', label: 'Firestore: Deploy rules and create indexes for Firestore', checked: false},
      {name: 'functions', label: 'Functions: Configure and deploy Cloud Functions', checked: false},
      {name: 'hosting', label: 'Hosting: Configure and deploy Firebase Hosting sites', checked: false},
      {name: 'storage', label: 'Storage: Deploy Cloud Storage security rules', checked: false}
    ];

    var next;
    // HACK: Windows Node has issues with selectables as the first prompt, so we
    // add an extra confirmation prompt that fixes the problem
    if (process.platform === 'win32') {
      next = prompt.once({
        type: 'confirm',
        message: 'Are you ready to proceed?'
      });
    } else {
      next = RSVP.resolve(true);
    }

    return next.then(function(proceed) {
      if (!proceed) {
        return utils.reject('Aborted by user.', {exit: 1});
      }

      if (feature) {
        setup.featureArg = true;
        setup.features = [feature];
        return undefined;
      }

      return prompt(setup, [{
        type: 'checkbox',
        name: 'features',
        message: 'Which Firebase CLI features do you want to setup for this folder? ' +
          'Press Space to select features, then Enter to confirm your choices.',
        choices: prompt.convertLabeledListChoices(choices)
      }]);
    }).then(function() {
      if (!setup.featureArg) {
        setup.features = setup.features.map(function(feat) {
          return prompt.listLabelToValue(feat, choices);
        });
      }
      if (setup.features.length === 0) {
        utils.logWarning('You have have not selected any features. Continuing will simply associate this folder ' +
          'with a Firebase project. Press Ctrl + C if you want to start over.');
      }
      setup.features.unshift('project');
      return init(setup, config, options);
    }).then(function() {
      logger.info();
      utils.logBullet('Writing configuration info to ' + chalk.bold('firebase.json') + '...');
      config.writeProjectFile('firebase.json', setup.config);
      utils.logBullet('Writing project information to ' + chalk.bold('.firebaserc') + '...');
      config.writeProjectFile('.firebaserc', setup.rcfile);
      logger.info();
      utils.logSuccess('Firebase initialization complete!');

      if (setup.createProject) {
        logger.info();
        logger.info(chalk.bold.cyan('Project creation is only available from the Firebase Console'));
        logger.info('Please visit', chalk.underline('https://console.firebase.google.com'), 'to create a new project, then run', chalk.bold('firebase use --add'));
      }
    });
  });
