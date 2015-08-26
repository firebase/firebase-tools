'use strict';

var Command = require('../lib/command');
var requireAuth = require('../lib/requireAuth');
var getFirebaseName = require('../lib/getFirebaseName');
var logger = require('../lib/logger');
var _ = require('lodash');
var Table = require('cli-table');
var api = require('../lib/api');
var chalk = require('chalk');

module.exports = new Command('collab')
  .description('list collaborators for the current app')
  .option('-f, --firebase <app>', 'override the app specified in firebase.json')
  .before(requireAuth)
  .action(function(options) {
    var firebase = getFirebaseName(options);

    return api.request('GET', '/firebase/' + firebase + '/users', {}, true).then(function(res) {
      console.log(res.body);
      var table = new Table({
        head: ['Email', 'Role'],
        style: {head: ['yellow']}
      });
      var users = _.values(res.body).map(function(collab) {
        var role = collab.role;
        if (collab.isPending) {
          role = role + ' (pending)';
        }
        table.push([collab.email, role]);
        return {
          email: collab.email,
          role: collab.role
        };
      });
      logger.info(table.toString());
      return users;
    });
  });
