var Table = require('easy-table'),
    prompt = require('prompt'),
    argv = require('optimist').argv,
    Auth = require('./auth'),
    fs = require('fs'),
    path = require('path'),
    App = require('./app'),
    Api = require('./api'),
    packageInfo = require('../package.json');

var Firebase = {
  login: function() {
    Auth.login(function(err) {
      if (err) {
        console.log('Log in unsuccessful');
      } else {
        console.log('Successfully logged in');
      }
    });
  },
  logout: function() {
    var deleteAll = ((typeof(argv.d) !== 'undefined') && (argv.d));
    Auth.logout(deleteAll, function(err) {
      if (err) {
        console.log('Log out unsuccessful');
      } else {
        console.log('Successfully logged out');
      }
    });
  },
  list: function() {
    var that = this;
    Auth.requireLogin(function(err) {
      if (err) {
        console.log('Could not list Firebases');
        return;
      }
      that._list();
    });
  },
  _list: function() {
    Api.request('GET', '/account', {}, true, function(statusCode, response) {
      if (typeof(response.firebases) !== 'undefined') {
        var t = new Table;
        for (var firebase in response.firebases) {
          if (response.firebases.hasOwnProperty(firebase)) {
            t.cell('Name', firebase);
            t.cell('Url', 'https://' + firebase + '.firebaseio.com');
            t.cell('Role', response.firebases[firebase].role);
            t.newRow();
          }
        }
        console.log("\n" + t.toString());
      }
    });
  },
  App: App
};

function initFirebase() {
  if (typeof(packageInfo.version) === 'string') {
    Firebase.version = packageInfo.version;
  } else {
    Firebase.version = 0;
  }
}

initFirebase();

module.exports = Firebase;
