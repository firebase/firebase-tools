var auth = require('./auth'),
    packageInfo = require('../package.json'),
    fs = require('fs'),
    util = require('util'),
    _when = require('when');

module.exports = {
  login: function() {
    auth.login(function(err) {
      if (err) {
        console.log('LOGIN UNSUCCESSFUL'.red);
        process.exit(1);
      } else {
        console.log('LOGIN SUCCESSFUL'.green);
      }
    });
  },
  logout: function(deleteAll) {
    auth.logout(deleteAll, function(err) {
      if (err) {
        console.log('LOG OUT UNSUCCESSFUL'.red);
        process.exit(1);
      } else {
        console.log('LOG OUT SUCCESSFUL'.green);
      }
    });
  },
  list: function() {
    auth.listFirebases().then(function(res) {
      res.showFirebases();
    }, function(error) {
      switch (error.type) {
        case 'LOGIN':
          console.log('LOGIN UNSUCCESSFUL'.red);
          break;
        default:
          console.log('COULD NOT LIST FIREBASES'.red);
      }
    });
  },
  version: packageInfo.version || 0
};
