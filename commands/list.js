'use strict';

var Command = require('../lib/command');
var api = require('../lib/api');
var requireAuth = require('../lib/requireAuth');
var chalk = require('chalk');
var Table = require('cli-table');
var _ = require('lodash');
var logger = require('../lib/logger');

module.exports = new Command('list')
  .description('list the Firebases to which you have access')
  .before(requireAuth)
  .action(function(options) {
    return api.getProjects().then(function(projects) {
      var tableHead = ['Name', 'Project ID / Instance', 'Permissions'];
      var table = new Table({
        head: tableHead,
        style: {head: ['yellow']}
      });

      var out = [];
      _.forEach(projects, function(data, projectId) {
        var project = {
          name: data.name,
          id: projectId,
          permission: data.permission,
          instance: data.instances.database[0]
        };

        var displayId = chalk.bold(projectId);
        if (data.instances.database[0] !== projectId) {
          displayId += '\n' + data.instances.database[0] + ' (instance)';
        }

        var displayPermission;
        switch (data.permission) {
        case 'own':
          displayPermission = chalk.cyan.bold('Owner');
          break;
        case 'edit':
          displayPermission = chalk.bold('Editor');
          break;
        case 'view':
        default:
          displayPermission = 'Viewer';
        }

        var displayName = data.name;
        if (options.project === projectId) {
          displayName = chalk.cyan.bold(displayName + ' (current)');
        }

        out.push(project);
        var row = [
          displayName,
          displayId,
          displayPermission
        ];
        table.push(row);
      });

      if (_.size(projects) === 0) {
        logger.info(chalk.bold('No projects found.'));
        logger.info();
        logger.info(
          chalk.bold.cyan('Projects missing?') + ' This version of the Firebase CLI is only compatible with\n' +
          'projects that have been upgraded to the new Firebase Console. To access your\n' +
          'firebase.com apps, use a previous version: ' + chalk.bold('npm install -g firebase-tools@^2.1')
        );
      } else {
        logger.info(table.toString());
      }
      return out;
    });
  });
