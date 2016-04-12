'use strict';

var _ = require('lodash');
var chalk = require('chalk');
var RSVP = require('rsvp');

var Command = require('../lib/command');
var Config = require('../lib/config');
var logger = require('../lib/logger');
var prompt = require('../lib/prompt');
var utils = require('../lib/utils');

var MOVE_KEYS = {
  rules: 'database.rules'
};
Config.LEGACY_HOSTING_KEYS.forEach(function(key) {
  MOVE_KEYS[key] = 'hosting.' + key;
});

module.exports = new Command('tools:migrate')
  .description('ensure your firebase.json format is up to date')
  .option('-y, --confirm', 'pass this option to bypass confirmation prompt')
  .action(function(options) {
    utils.logBullet('Checking feature configuration...');
    var out = _.cloneDeep(options.config._src);
    var changed = false;

    _.forEach(MOVE_KEYS, function(dest, src) {
      if (_.has(out, src)) {
        _.set(out, dest, _.get(out, src));
        _.unset(out, src);
        changed = true;
      }
    });

    utils.logBullet('Checking for "firebase" key...');
    var projectId = out.firebase;
    var rcfile;
    if (projectId) {
      rcfile = {projects: {default: projectId}};
      _.unset(out, 'firebase');
      changed = true;
    }

    if (!changed) {
      logger.info();
      utils.logSuccess('No action required, your firebase.json is all up to date!');
      return true;
    }

    logger.info();
    logger.info(chalk.gray.bold('# preview: updated contents of firebase.json'));
    logger.info();
    logger.info(JSON.stringify(out, null, 2));
    logger.info();

    var next;
    if (options.confirm) {
      next = RSVP.resolve(true);
    } else {
      next = prompt.once({
        type: 'confirm',
        message: 'Write new config to ' + chalk.underline('firebase.json') + '?',
        default: true
      });
    }

    return next.then(function(confirmed) {
      if (confirmed) {
        options.config.writeProjectFile('firebase.json', out);
        utils.logSuccess('Migrated ' + chalk.bold('firebase.json') + ' successfully');
        if (projectId) {
          options.config.writeProjectFile('.firebaserc', rcfile);
          utils.makeActiveProject(options.projectRoot, projectId);
          utils.logSuccess('Set default project to ' + chalk.bold(projectId));
        }
      } else {
        return utils.reject('Migration aborted by user.', {exit: 1});
      }
    });
  });
