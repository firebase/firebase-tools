var request = require('request'),
    fs = require('fs'),
    path = require('path'),
    zlib = require('zlib'),
    tar = require('tar'),
    url = require('url'),
    prompt = require('prompt'),
    open = require('open'),
    Firebase = require('firebase'),
    _firebase = require('./firebase'),
    ProgressBar = require('progress'),
    upload = require('./upload'),
    auth = require('./auth'),
    api = require('./api'),
    util = require('util'),
    chalk = require('chalk'),
    temp = require('temp'),
    _when = require('when');

var defaultSettings = {
  'public': '.'
};

temp.track();

function getPrompt(schema, onComplete, idx, results) {
  if (!Array.isArray(schema)) {
    console.log(chalk.red('An error occurred'));
    process.exit(1);
  }
  onComplete = typeof onComplete !== 'function' ? function() {} : onComplete;
  idx = typeof idx !== 'number' ? 0 : idx;
  results = typeof results !== 'object' ? {} : results;
  var item = schema[idx];
  if (typeof item.beforeValue === 'function') {
    item.beforeValue(results);
  }
  prompt.get(schema[idx], function (error, result) {
    if (error) {
      console.log(chalk.red('Input Error'));
      process.exit(1);
    }
    results[item.name] = result[item.name];
    if (++idx < schema.length) {
      getPrompt(schema, onComplete, idx, results);
    } else {
      onComplete(results);
    }
  });
}

module.exports = {
  init: function(argv) {
    auth.listFirebases().then(function(res) {

      var settingsFile = path.resolve('./firebase.json');
      if (fs.existsSync(settingsFile)) {
        console.log(chalk.yellow('Directory already initialized'));
        console.log('You can edit your settings in firebase.json or delete this file to start over');
        process.exit(1);
      }
      if (res.firebases.length === 0) {
        console.log(chalk.yellow('You have no apps in your Firebase account'));
        console.log('Sign in to %s and create an app', chalk.cyan('https://firebase.com'));
        console.log('then initialize a directory for hosting');
        process.exit(1);
      }

      // Firebase names always a subset of ^[0-9a-z-]*$ so safe to regex
      var validFirebasePattern = new RegExp('^(' + res.firebases.join('|') + ')$');
      if (!argv.firebase || (typeof(argv.firebase) !== 'string') || !argv.firebase.match(validFirebasePattern)) {
        res.showFirebases();
      }

      var schema = [{
        name: 'firebase',
        required: true,
        pattern: validFirebasePattern,
        beforeValue: function() {
          if (!argv.firebase || (typeof(argv.firebase) !== 'string') || !argv.firebase.match(validFirebasePattern)) {
            console.log('Enter the name of the Firebase app you would like to use for hosting');
          }
        },
        message: 'Please choose an app from the list above',
        description: chalk.bold('Firebase app:'),
        type: 'string'
      },{
        name: 'public',
        required: true,
        beforeValue: function(results) {
          console.log(chalk.yellow('----------------------------------------------------'));
          console.log(chalk.yellow('Site URL: %s'), api.hostingUrl.replace(/\/\//, util.format('//%s.', results.firebase)));
          console.log(chalk.yellow('----------------------------------------------------'));
          if (!argv.public || (typeof(argv.public) !== 'string')) {
            console.log('Enter the name of your app\'s public directory.');
            console.log('(usually where you store your index.html file)');
          }
        },
        description: chalk.bold('Public Directory:'),
        default: 'current directory',
        type: 'string',
        before: function(value) {
          if (value === 'current directory') {
            return '.';
          }
          else {
            return value;
          }
        }
      }];

      getPrompt(schema, function(results) {
        if (path.relative('.', results['public']).match(/^\./)) {
          console.log(chalk.red('init cancelled - the public directory must be within the current working directory'));
          process.exit(1);
        }
        if (!fs.existsSync(results['public'])) {
          console.log(chalk.red('init cancelled - the directory you entered does not exist'));
          process.exit(1);
        }
        var settings = {
          firebase: results.firebase,
          'public': results['public']
        };
        console.log('Initializing app into current directory...');
        auth.checkCanAccess(results.firebase, function(err) {
          if (err) {
            console.log(chalk.red('Permission Error') + ' - you do not have permission to use this Firebase');
            process.exit(1);
          }
          console.log('Writing firebase.json settings file...');
          var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
          try {
            fs.writeFileSync(settingsFile, settingsJSON);
            console.log(chalk.green('Successfully initialized app'));
            console.log('To deploy: %s', chalk.bold('firebase deploy'));
          } catch (error) {
            console.log(chalk.red('init failed - firebase.json could not be created'));
            console.log(chalk.yellow('You may want to review the permissions for this directory'));
            console.log(chalk.yellow('For help, please contact support@firebase.com'));
            process.exit(1);
          }
        });
      });

    }, function(error) {
        console.log(chalk.yellow('We\'re really sorry, but we are currently experiencing issues connecting to Firebase.'));
        console.log(chalk.yellow('Please try again later. If this problem continues, please contact support@firebase.com.'));
        process.exit(1);
    });
  },
  bootstrap: function(argv) {
    _when.join(this.getTemplates(), auth.listFirebases()).done(function(resultSet) {
      var supportedTemplates = resultSet[0],
          res = resultSet[1];

      if (res.firebases.length === 0) {
        console.log(chalk.yellow('You have no apps in your Firebase account'));
        console.log('Sign in to %s and create an app', chalk.cyan('https://firebase.com'));
        console.log('then initialize a directory for hosting');
        process.exit(1);
      }

      // Firebase names always a subset of ^[0-9a-z-]*$ so safe to regex
      var templateList = Object.keys(supportedTemplates).sort();
      var firebasePattern = new RegExp('^(' + res.firebases.join('|') + ')$');
      var templatePattern = new RegExp('^(' + templateList.join('|') + ')$');
      if (!argv.firebase || (typeof(argv.firebase) !== 'string') || !argv.firebase.match(firebasePattern)) {
        res.showFirebases();
      }

      var schema = [{
        name: 'firebase',
        required: true,
        pattern: firebasePattern,
        beforeValue: function() {
          if (!argv.firebase || (typeof(argv.firebase) !== 'string') || !argv.firebase.match(firebasePattern)) {
            console.log('Enter the name of the Firebase app you would like to use for hosting');
          }
        },
        description: chalk.bold('Firebase app:'),
        type: 'string'
      },{
        name: 'template',
        required: true,
        pattern: templatePattern,
        beforeValue: function(results) {
          if (!argv.template || (typeof(argv.template) !== 'string') || !argv.template.match(templatePattern)) {
            console.log(chalk.yellow('----------------------------------------------------'));
            console.log(chalk.yellow('Available Templates'));
            console.log(chalk.yellow('----------------------------------------------------'));
            console.log(templateList.join('\n'));
            console.log(chalk.yellow('----------------------------------------------------'));
            console.log('Choose a template to help you get started with your app');
          }
        },
        description: chalk.bold('Template:'),
        type: 'string'
      }];

      getPrompt(schema, function(results) {
        var firebase = results.firebase;
        var dir = firebase;
        var projectDir = path.resolve(dir);
        var tempDir = temp.mkdirSync();
        if (fs.existsSync(projectDir)) {
          var i = 1;
          do {
            dir = firebase + '_' + i++;
            projectDir = path.resolve(dir);
          } while (fs.existsSync(projectDir));
        }

        results.directory = dir;
        console.log('Bootstrapping into directory \'' + dir + '\'...');
        try {
          fs.mkdirSync(projectDir, '0755');
        } catch (err) {
          console.log(chalk.red('Filesystem Error') + ' - Could not create new' +
                        ' directory');
          process.exit(1);
        }

        // Load the project root if defined, and gracefully handle missing '/'
        var templateRoot = supportedTemplates[results.template].templateRoot || '/';
        if (templateRoot && templateRoot[0] !== '/') {
          templateRoot = '/' + templateRoot;
        }

        console.log('Downloading and unpacking template...');
        var gunzip = zlib.createGunzip();
        var untar = tar.Extract({
          path: tempDir,
          strip: 1,
          filter: function(entry) {
            if (!templateRoot) {
              return true;
            } else {
              return (entry.path === tempDir) || (entry.path.indexOf(tempDir + templateRoot) === 0);
            }
          }
        });

        try {
          request(supportedTemplates[results.template].tarball).pipe(gunzip).pipe(untar);
        } catch (err) {
          console.log(chalk.red('Download Error') + ' - Could not download ' +
                        'template');
          process.exit(1);
        }

        var caughtFinishedEvent = false;
        untar.on('end', function() {
          if (caughtFinishedEvent) return;
          caughtFinishedEvent = true;

          try {
            fs.renameSync(tempDir + templateRoot, projectDir);
          } catch (err) {
            console.log(chalk.red('Installation Error') + ' - Couldn\'t relocate project assets');
            process.exit(1);
          }

          var configFiles = supportedTemplates[results.template].configFiles || [];
          for (var i = 0; i < configFiles.length; i++) {
            var config = path.join(
                           projectDir,
                           configFiles[i]
                         );
            try {
              var data = fs.readFileSync(config, 'utf8'),
                  realtimeHost = api.realtimeUrl.replace(/\/\//, '//' + firebase + '.');
              var replaced = data.replace(
                               new RegExp(supportedTemplates[results.template].configRegex, 'g'),
                               realtimeHost
                             );
              fs.writeFileSync(config, replaced);
            } catch (err) {
              console.log(chalk.red('Initialization Error') + ' - Couldn\'t update template with project settings');
              process.exit(1);
            }
          }

          console.log('Writing firebase.json settings file...');
          var settings = {
            'firebase': firebase,
            'public': '.'
          };

          if (supportedTemplates[results.template].settings) {
            if (supportedTemplates[results.template].settings['public']) {
              settings.public = supportedTemplates[results.template].settings['public'].replace(/\//g, path.sep)
            }
            if (supportedTemplates[results.template].settings['rules']) {
              settings.rules = supportedTemplates[results.template].settings['rules'].replace(/\//g, path.sep);
            }
          }

          var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
          var settingsFile = path.join(projectDir, 'firebase.json');
          try {
            fs.writeFileSync(settingsFile, settingsJSON);
          } catch (err) {
            console.log(chalk.red('Filesystem Error') + ' - Could not save settings file');
            process.exit(1);
          }

          console.log(chalk.green('Successfully added template'));
          console.log('To deploy: %s then %s', chalk.bold(util.format('cd %s/', results.directory)), chalk.bold('firebase deploy'));
        });
      });
    }, function(error) {
      switch (error.type) {
        case 'LOGIN':
          console.log(chalk.red('Login Error'));
          process.exit(1);
          break;
        case 'GET-TEMPLATES':
          console.log(chalk.red('Bootstrapping Error: ') + 'Could not retrieve available templates.');
          process.exit(1);
          break;
        case 'PARSE-TEMPLATES':
          console.log(chalk.red('Bootstrapping Error: ') + 'Could not parse available templates.');
          process.exit(1);
          break;
        default:
          console.log(chalk.red('Bootstrapping Error'));
          process.exit(1);
      }
    });
  },
  deploy: function(argv) {
    auth.requireLogin(function(err) {
      if (err) {
        console.log(chalk.red('Login Error'));
        process.exit(1);
      }
      var settingsFile = path.resolve('./firebase.json');
      var settingsJSON, settings;
      if (!fs.existsSync(settingsFile)) {
        console.log(chalk.red('Initialization Error') + ' - Directory not ' +
                      'initialized');
        process.exit(1);
      }
      try {
        settingsJSON = fs.readFileSync(settingsFile);
        settings = JSON.parse(settingsJSON);
      } catch (err) {
        console.log(chalk.red('Initialization Error') +' - Could not read ' +
                          'firebase.json settings file');
        process.exit(1);
      }
      if (typeof(settings.firebase) !== 'string') {
        console.log(chalk.red('Initialization Error') +' - Could not read ' +
                          'firebase.json settings file');
        process.exit(1);
      }
      auth.checkCanAccess(settings.firebase, function(err, tokens) {
        if (err) {
          console.log(chalk.red('Permission Error') + ' - You do not have ' +
                                'permission to use this Firebase');
          process.exit(1);
        }
        for (var i in defaultSettings) {
          if (defaultSettings.hasOwnProperty(i) &&
                !settings.hasOwnProperty(i)) {
            settings[i] = defaultSettings[i];
          }
        }
        if (path.relative('.', settings['public']).match(/^\.\./)) {
          console.log(chalk.red('Public Directory Error') + ' - public directory' +
                            ' must be within current working directory');
          process.exit(1);
        }
        if (!fs.existsSync(settings['public'])) {
          console.log(chalk.red('Public Directory Error') + ' - Public directory ' +
                                'does not exist');
          process.exit(1);
        }

        var firebaseRef = new Firebase(api.realtimeUrl.replace(/\/\//, '//firebase.'));
        firebaseRef.auth(tokens.firebaseToken, function(error, result) {
          if (error) {
            console.log('Firebase authentication failed!');
            process.exit(1);
          }
        });
        var directoryRef = firebaseRef
                .child('hosting/versions')
                .child(settings.firebase)
                .push();
        auth.updateRules(settings.firebase,
                         tokens.personalToken,
                         settings.rules,
                         function(statusCode, response) {
          if (response.error) {
            console.log(chalk.red('Security Rules Error') + ' - ' +
                                response.error.replace(/\n$/, ''));
            process.exit(1);
          }
          var bar = null;
          var total = 0;
          directoryRef.on('value', function(snapshot) {
            var status = snapshot.child('status').val();
            if (status === 'deployed') {
              var url = api.hostingUrl.replace(/\/\//, util.format('//%s.', settings.firebase));
              console.log(chalk.green('Successfully deployed'));
              console.log('Site URL: %s, or use %s', chalk.cyan(url), chalk.bold('firebase open'));
              console.log('Hosting Dashboard: %s then view the hosting section of your app', chalk.cyan('https://firebase.com/account'));
              process.exit(0);
            } else if (status === 'deploying') {
              if (!bar && snapshot.hasChild('fileCount')) {
                total = snapshot.child('fileCount').val();
                bar = new ProgressBar(chalk.yellow('progress: :percent'), {
                  total: total
                });
              }
              if (bar) {
                var uploadedCount = snapshot.hasChild('uploadedCount') ? snapshot.child('uploadedCount').val() : 0;
                bar.update(uploadedCount / total);
              }
            } else if (status === 'removed') {
              console.log(chalk.green('Sucessfully removed'));
              process.exit(0);
            } else if (status === 'failed') {
              if (bar) {
                bar.terminate();
              }
              var message = chalk.red('Deploy Failed');
              if (snapshot.hasChild('statusMessage')) {
                message += ' - ' + snapshot.child('statusMessage').val();
              }
              console.log(message);
              process.exit(1);
            }
          });

          var message = null;
          if (argv.message && (typeof(argv.message) === 'string')) {
            message = argv.message;
          }

          upload.send(settings.firebase, settings['public'], directoryRef.name(), message, function(err, directory) {
            if (err) {
              console.log(chalk.red('Deploy Error') + ' - Couldn\'t upload app');
              console.log(err);
              process.exit(1);
            }
          });
        });
      });
    });
  },
  open: function(argv) {
    var settingsFile = path.resolve('./firebase.json');
    var settingsJSON, settings;
    if (!fs.existsSync(settingsFile)) {
      console.log(chalk.red('Initialization Error') + ' - Directory not ' +
                    'initialized');
      process.exit(1);
    }
    try {
      settingsJSON = fs.readFileSync(settingsFile);
      settings = JSON.parse(settingsJSON);
    } catch (err) {
      console.log(chalk.red('Initialization Error') +' - Could not read ' +
                        'firebase.json settings file');
      process.exit(1);
    }
    if (typeof(settings.firebase) !== 'string') {
      console.log(chalk.red('Initialization Error') +' - Could not read ' +
                        'firebase.json settings file');
      process.exit(1);
    }
    open(api.hostingUrl.replace(/\/\//, util.format('//%s.', settings.firebase)));
  },
  getTemplates: function() {
    return _when.promise(function(resolve, reject, notify) {
      request('https://firebase-public.firebaseio.com/cli-templates.json', function(error, response, body) {
        if (error) {
          error.type = 'GET-TEMPLATES';
          return reject(error);
        }

        try {
          var templates = JSON.parse(body);
          for (var key in templates) {
            if (!templates[key].enabled) {
              delete templates[key];
            }
          }
          resolve(templates);
        } catch (e) {
          error.type = 'PARSE-TEMPLATES';
          return reject(error);
        }
      });
    });
  }
};
