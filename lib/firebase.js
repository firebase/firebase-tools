var auth = require('./auth'),
    packageInfo = require('../package.json'),
    fs = require('fs'),
    util = require('util'),
    _when = require('when');

module.exports = {
  login: function() {
    auth.login(function(err) {
      if (err) {
        console.log(chalk.red('Login Unsuccessful'));
        process.exit(1);
      } else {
        console.log(chalk.green('Login Successful'));
      }
    });
  },
  logout: function(deleteAll) {
    auth.logout(deleteAll, function(err) {
      if (err) {
        console.log(chalk.red('Log Out Unsuccessful'));
        process.exit(1);
      } else {
        console.log(chalk.green('Log Out Successful'));
      }
    });
  },
  list: function() {
    auth.listFirebases().then(function(res) {
      res.showFirebases();
    }, function(error) {
      switch (error.type) {
        case 'LOGIN':
          console.log(chalk.red('Login Unsuccessful'));
          break;
        default:
          console.log(chalk.red('Could Not List Firebases'));
      }
    });
  },
  version: packageInfo.version || 0
};
