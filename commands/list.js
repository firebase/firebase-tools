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
      var tableHead = ['Name', 'Project ID', 'Permissions', 'Instance'];
      var table = new Table({
        head: tableHead,
        style: {head: ['yellow']}
      });

      var out = [];
      _.forEach(projects, function(data) {
        var project = {
          name: data.name,
          id: data.id,
          permission: data.permission,
          instance: data.instances.database[0]
        };

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
        if (options.project === data.id) {
          displayName = chalk.cyan.bold(displayName + ' (current)');
        }

        out.push(project);
        var row = [
          displayName,
          data.id,
          displayPermission,
          project.instance
        ];
        table.push(row);
      });

      logger.info(table.toString());
      return out;
    });
  });
