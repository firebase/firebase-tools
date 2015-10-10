'use strict';

var Command = require('../lib/command');
var api = require('../lib/api');
var requireAuth = require('../lib/requireAuth');
var chalk = require('chalk');
var Table = require('cli-table');
var _ = require('lodash');
var logger = require('../lib/logger');
var Config = require('../lib/config');

var coloredPlan = function(plan) {
  var color;
  if (plan.id === 'free') {
    color = chalk.grey;
  } else {
    color = chalk.green;
  }
  return color(plan.name || '');
};

module.exports = new Command('list')
  .description('list the Firebases to which you have access')
  .before(requireAuth)
  .action(function(options) {
    var config = Config.load(options, true);

    return api.getFirebases().then(function(firebases) {
      var table = new Table({
        head: ['Name', 'Plan', 'Collaborators'],
        style: {head: ['yellow']}
      });

      var out = [];
      _.forEach(firebases, function(data, name) {
        var project = {
          id: name,
          plan: data.plan.id,
          collaborators: []
        };

        _.forEach(data.users, function(info, email) {
          project.collaborators.push({
            email: email,
            uid: info.uid,
            role: info.role
          });
        });

        var displayName = name;
        if (_.get(config, 'defaults.project') === name) {
          displayName = chalk.cyan.bold(displayName + ' (current)');
        }
        out.push(project);
        table.push([
          displayName,
          coloredPlan(data.plan),
          _.keys(data.users).join('\n')
        ]);
      });

      logger.info(table.toString());
      return out;
    });
  });
