'use strict';

var Command = require('../lib/command');
var api = require('../lib/api');
var requireAuth = require('../lib/requireAuth');
var chalk = require('chalk');
var Table = require('cli-table');
var _ = require('lodash');
var logger = require('../lib/logger');
var Config = require('../lib/config');

module.exports = new Command('list')
  .description('list the Firebases to which you have access')
  .before(requireAuth)
  .action(function(options) {
    var config = Config.load(options, true);

    return api.getProjects().then(function(projects) {
      var needExtraCol = _.some(projects, function(data) {
        return data.id !== data.firebase;
      });

      var tableHead = ['Name', 'Project ID', 'Permissions'];
      if (needExtraCol) {
        tableHead.push('Legacy ID');
      }
      var table = new Table({
        head: tableHead,
        style: {head: ['yellow']}
      });

      var out = [];
      _.forEach(projects, function(data, id) {
        var project = {
          name: data.name,
          id: id,
          permission: data.permission
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
        if (options.project === id) {
          displayName = chalk.cyan.bold(displayName + ' (current)');
        }
        out.push(project);
        var row = [
          displayName,
          id,
          displayPermission
        ];
        if (needExtraCol) {
          if (data.firebase === id) {
            row.push('');
          } else {
            row.push(data.firebase);
          }
        }
        table.push(row);
      });

      logger.info(table.toString());
      return out;
    });
  });
