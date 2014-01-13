var argv = require('optimist').argv,
    auth = require('./auth'),
    fs = require('fs'),
    path = require('path'),
    prompt = require('prompt'),
    App = require('./app'),
    api = require('./api'),
    packageInfo = require('../package.json');

var Firebase = {
  login: function() {
    auth.login(function(err) {
      if (err) {
        prompt.logger.error('LOGIN UNSUCCESSFUL');
      } else {
        prompt.logger.info('LOGIN SUCCESSFUL');
      }
    });
  },
  logout: function() {
    var deleteAll = ((typeof(argv.d) !== 'undefined') && (argv.d));
    auth.logout(deleteAll, function(err) {
      if (err) {
        prompt.logger.error('LOG OUT UNSUCCESSFUL');
      } else {
        prompt.logger.info('LOG OUT SUCCESSFUL');
      }
    });
  },
  list: function() {
    var that = this;
    auth.requireLogin(function(err) {
      if (err) {
        prompt.logger.error('COULD NOT LOG IN');
      } else {
        auth.getFirebases(function(err, firebases) {
          if (err) {
            prompt.logger.error('COULD NOT LIST FIREBASES');
          } else {
            console.log('----- YOUR FIREBASES -----'.green);
            console.log(firebases.join('\n'));
            console.log('--------------------------'.green);
          }
        });
      }
    });
  },
  showHelp: function() {
    this.showVersion();
    console.log('Usage: firebase <command>\n' +
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
                '    -d  Optional flag to delete the settings file.\n' +
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
                '    server.\n');
  },
  showVersion: function() {
    console.log('\n' +
                'Firebase Command Line Tools\n' +
                'Version ' + this.version + '\n' +
                'https://www.firebase.com\n');
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
