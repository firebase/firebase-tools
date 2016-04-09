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

    var chooseFeatures;
    var choices = [
      {name: 'database', label: 'Database: Deploy rules for your Firebase Realtime Database', checked: true},
      {name: 'functions', label: 'Functions: Configure and deploy Firebase Functions', checked: true},
      {name: 'hosting', label: 'Hosting: Configure and deploy Firebase Hosting sites', checked: true},
      {name: 'storage', label: 'Storage: Deploy rules for Firebase Storage', checked: true}
    ];
    // TODO: Splice out functions when no preview enabled.
    if (feature) {
      setup.features = [feature];
      chooseFeatures = RSVP.resolve();
    } else {
      chooseFeatures = prompt(setup, [
        {
          type: 'checkbox',
          name: 'features',
          message: 'What Firebase CLI features do you want to setup for this folder?',
          choices: prompt.convertLabeledListChoices(choices)
        }
      ]);
    }
    return chooseFeatures.then(function() {
      setup.features = setup.features.map(function(feat) {
        return prompt.listLabelToValue(feat, choices);
      });
      console.log(setup.features);
      setup.features.push('project');
      return init(setup, config, options);
    }).then(function() {
      logger.info();
      utils.logBullet('Writing configuration info to ' + chalk.bold('firebase.json') + '...');
      config.writeProjectFile('firebase.json', setup.config);
      utils.logBullet('Writing project information to ' + chalk.bold('.firebaserc') + '...');
      config.writeProjectFile('.firebaserc', setup.rcfile);
      logger.info();
      utils.logSuccess('Firebase initialization complete!');
    });
  });
