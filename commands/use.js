'use strict';

var Command = require('../lib/command');
var logger = require('../lib/logger');
var requireAuth = require('../lib/requireAuth');
var api = require('../lib/api');
var chalk = require('chalk');
var utils = require('../lib/utils');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var prompt = require('../lib/prompt');

var writeAlias = function(projectDir, rc, alias, projectId) {
  if (projectId) {
    _.set(rc, ['projects', alias], projectId);
  } else {
    _.unset(rc, ['projects', alias], projectId);
  }
  fs.writeFileSync(path.resolve(projectDir, './.firebaserc'), JSON.stringify(rc, null, 2));
};

var listAliases = function(options) {
  if (_.size(options.rc, 'projects') > 0) {
    logger.info('Project aliases for', chalk.bold(options.projectRoot) + ':');
    logger.info();
    _.forEach(options.rc.projects, function(projectId, alias) {
      var listing = alias + ' (' + projectId + ')';
      if (options.project === projectId || options.projectAlias === alias) {
        logger.info(chalk.cyan.bold('* ' + listing));
      } else {
        logger.info('  ' + listing);
      }
    });
    logger.info();
  }
  logger.info('Run', chalk.bold('firebase use --add'), 'to define a new project alias.');
};

var verifyMessage = function(name) {
  return 'please verify project ' + chalk.bold(name) + ' exists and you have access.';
};

module.exports = new Command('use [alias_or_project_id]')
  .description('set an active Firebase project for your working directory')
  .option('--add', 'create a new project alias interactively')
  .option('--alias <name>', 'create a new alias for the provided project id')
  .option('--unalias <name>', 'remove an already created project alias')
  .option('--clear', 'clear the active project selection')
  .before(requireAuth)
  .action(function(newActive, options) {
    // HACK: Commander.js silently swallows an option called alias >_<
    var aliasOpt;
    var i = process.argv.indexOf('--alias');
    if (i >= 0 && process.argv.length > i + 1) {
      aliasOpt = process.argv[i + 1];
    }

    if (!options.projectRoot) { // not in project directory
      return utils.reject(chalk.bold('firebase use') + ' must be run from a Firebase project directory.\n\nRun ' + chalk.bold('firebase init') + ' to start a project directory in the current folder.');
    }

    if (newActive) { // firebase use [alias_or_project]
      var aliasedProject = _.get(options.rc, ['projects', newActive]);
      return api.getProjects().then(function(projects) {
        if (aliasOpt) { // firebase use [project] --alias [alias]
          if (!projects[newActive]) {
            return utils.reject('Cannot create alias ' + chalk.bold(aliasOpt) + ', ' + verifyMessage(newActive));
          }
          writeAlias(options.projectRoot, options.rc, aliasOpt, newActive);
          aliasedProject = newActive;
          logger.info('Created alias', chalk.bold(aliasOpt), 'for', aliasedProject + '.');
        }

        if (aliasedProject) { // found alias
          if (!projects[aliasedProject]) { // found alias, but not in project list
            return utils.reject('Unable to use alias ' + chalk.bold(newActive) + ', ' + verifyMessage(aliasedProject));
          }

          utils.makeActiveProject(options.projectRoot, newActive);
          logger.info('Now using alias', chalk.bold(newActive), '(' + aliasedProject + ')');
        } else if (projects[newActive]) { // exact project id specified
          utils.makeActiveProject(options.projectRoot, newActive);
          logger.info('Now using project', chalk.bold(newActive));
        } else { // no alias or project recognized
          return utils.reject('Invalid project selection, ' + verifyMessage(newActive));
        }
      });
    } else if (options.unalias) { // firebase use --unalias [alias]
      if (_.has(options.rc, ['projects', options.unalias])) {
        writeAlias(options.projectRoot, options.rc, options.unalias, null);
        logger.info('Removed alias', chalk.bold(options.unalias));
        logger.info();
        listAliases(options);
      }
    } else if (options.add) { // firebase use --add
      if (options.nonInteractive) {
        return utils.reject('Cannot run ' + chalk.bold('firebase use --add') + ' in non-interactive mode. Use ' + chalk.bold('firebase use <project_id> --alias <alias>') + ' instead.');
      }
      return api.getProjects().then(function(projects) {
        var results = {};
        return prompt(results, [
          {
            type: 'list',
            name: 'project',
            message: 'Which project do you want to add?',
            choices: Object.keys(projects).sort()
          },
          {
            type: 'input',
            name: 'alias',
            message: 'What alias do you want to use for this project? (e.g. staging)',
            validate: function(input) {
              return input && input.length > 0;
            }
          }
        ]).then(function() {
          writeAlias(options.projectRoot, options.rc, results.alias, results.project);
          utils.makeActiveProject(options.projectRoot, results.alias);
          logger.info();
          logger.info('Created alias', chalk.bold(results.alias), 'for', results.project + '.');
          logger.info('Now using alias', chalk.bold(results.alias) + ' (' + results.project + ')');
        });
      });
    } else if (options.clear) { // firebase use --clear
      utils.makeActiveProject(options.projectRoot, null);
      options.projectAlias = null;
      options.project = null;
      logger.info('Cleared active project.');
      logger.info();
      listAliases(options);
    } else { // firebase use
      if (!process.stdout.isTTY) {
        if (options.project) {
          logger.info(options.project);
          return options.project;
        }
        return utils.reject('No active project', {exit: 1});
      }

      if (options.projectAlias) {
        logger.info('Active Project:', chalk.bold.cyan(options.projectAlias + ' (' + options.project + ')'));
      } else if (options.project) {
        logger.info('Active Project:', chalk.bold.cyan(options.project));
      } else {
        var msg = 'No project is currently active';
        if (_.size(options.rc.projects === 0)) {
          msg += ', and no aliases have been created.';
        }
        logger.info(msg + '.');
      }
      logger.info();
      listAliases(options);
    }
  });
