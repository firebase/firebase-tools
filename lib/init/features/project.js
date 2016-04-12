'use strict';

var chalk = require('chalk');

var _ = require('lodash');
var api = require('../../api');
var prompt = require('../../prompt');
var logger = require('../../logger');
var utils = require('../../utils');

var NO_PROJECT = '[don\'t setup a default project]';
var NEW_PROJECT = '[create a new project]';

module.exports = function(setup, config) {
  setup.project = {};

  logger.info();
  logger.info('Now that your Firebase project directory is set up, it\'s time to associate');
  logger.info('it with a project. You can create multiple project aliases by running');
  logger.info(chalk.bold('firebase use --add') + ', but for now we\'ll just set up a default project.');
  logger.info();

  return api.getProjects().then(function(projects) {
    var choices = _.map(projects, function(info, projectId) {
      return {
        name: projectId,
        label: info.name + ' (' + projectId + ')'
      };
    });
    var nameOptions = [NO_PROJECT].concat(_.map(choices, 'label')).concat([NEW_PROJECT]);

    if (_.has(setup.rcfile, 'projects.default')) {
      utils.logBullet('.firebaserc already has a default project, skipping');
      return undefined;
    }

    return prompt.once({
      type: 'list',
      name: 'id',
      message: 'What Firebase project do you want to associate as default?',
      validate: function(answer) {
        if (!_.includes(nameOptions, answer)) {
          return 'Must specify a Firebase to which you have access.';
        }
        return true;
      },
      choices: nameOptions
    }).then(function(projectId) {
      if (projectId === NEW_PROJECT) {
        setup.createProject = true;
        return;
      } else if (projectId === NO_PROJECT) {
        return;
      }
      projectId = prompt.listLabelToValue(projectId, choices);

      // write "default" alias and activate it immediately
      _.set(setup.rcfile, 'projects.default', projectId);
      utils.makeActiveProject(config.projectDir, projectId);
    });
  });
};
