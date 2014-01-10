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
            var realtimeHost = Api.realtime.protocol + '//' + firebase + '.' +
                                Api.realtime.host;
            if (Api.realtime.port) {
              realtimeHost += ':' + Api.realtime.port;
            }
            t.cell('Url', realtimeHost);
            t.cell('Role', response.firebases[firebase].role);
            t.newRow();
          }
        }
        console.log("\n" + t.toString());
      }
    });
  },
  showHelp: function() {
    console.log('Firebase Command Line Tools\n' +
                'Version ' + this.version + '\n' +
                'https://www.firebase.com\n' +
                '\n' +
                'Usage: firebase <command>\n' +
                '\n' +
                '  Possible commands are:\n' +
                '\n' +
                '  login\n' +
                '    Authenticates with the Firebase servers and stores an access token locally.\n' +
                '    All commands that require authentication use this if no valid access token\n' +
                '    exists.\n' +
                '    --email     The email address of the account to attempt to log in with.\n' +
                '    --password  The password of the account to attempt to log in with.\n' +
                '\n' +
                '  logout\n' +
                '    Invalidates and destroys any locally stored access tokens.\n' +
                '\n' +
                '  list\n' +
                '    Lists the Firebases available to the currently logged in user.\n' +
                '\n' +
                '  app init\n' +
                '    Initializes a Firebase app in the current directory.\n' +
                '    -f, --firebase  The name of the Firebase to initialize the app with.\n' +
                '    -p, --public    A directory containing all of the app\'s static files that\n' +
                '                    should deployed to Firebase Hosting. Defaults to the current\n' +
                '                    directory.\n' +
                '    -r, --rules     An optional file that contains security rules for the\n' +
                '                    Firebase.\n' +
                '\n' +
                '  app bootstrap\n' +
                '    Creates a new Firebase app from a number of predetermined templates to\n' +
                '    quickly get a project up and running. Creates a new folder named after the\n' +
                '    Firebase it is initialized with.\n' +
                '    -f, --firebase  The name of the Firebase to initialize the app with.\n' +
                '    -t, --template  The name of the template to initialize the app with.\n' +
                '\n' +
                '  app deploy\n' +
                '    Publishes the app in the current directory to Firebase Hosting. If a file\n' +
                '    containing the security rules has been provided, these are uploaded to the\n' +
                '    server.\n' +
                '\n');
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
