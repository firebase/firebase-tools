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
    chalk = require('chalk');

var supportedTemplates = {
  angular: {
    url: 'https://codeload.github.com/firebase/angularFire-seed/' +
              'legacy.tar.gz/master',
    settings: {
      'public': 'app',
      'rules': 'config/security-rules.json',
    },
    config: 'app/js/config.js',
    configRegex: /https:\/\/INSTANCE\.firebaseio\.com/,
    completedMessage: chalk.green('BOOTSTRAPPING SUCCESSFUL') + ' - Instructions and' +
                        ' setup guide here: ' +
                        'https://github.com/firebase/angularFire-seed'.cyan
  },
  chat: {
    url: 'https://codeload.github.com/firebase/chat-seed/' +
              'legacy.tar.gz/master',
    settings: {
      'public': 'public',
      'rules': 'config/rules.json',
    },
    config: 'public/index.html',
    configRegex: /https:\/\/INSTANCE\.firebaseio\.com/,
    completedMessage: chalk.green('BOOTSTRAPPING SUCCESSFUL') + ' - Instructions and' +
                        ' setup guide here: ' +
                        'https://github.com/firebase/chat-seed'.cyan
  }
};

var defaultSettings = {
  'public': '.'
};

module.exports = {
  init: function(argv) {
    auth.listFirebases().then(function(res) {

      var settingsFile = path.resolve('./firebase.json');
      if (fs.existsSync(settingsFile)) {
        console.log(chalk.red('Initialization error') + ' - Directory alread initialized');
        process.exit(1);
      }
      if (res.firebases.length === 0) {
        console.log(chalk.red('No Firebase apps') + ' - You need to create a Firebase app on https://firebase.com before you initialize an app for hosting');
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
          console.log('Enter the name of the Firebase app you would like to use for hosting your website');
        },
        description: chalk.bold('Firebase app:'),
        type: 'string'
      },{
        name: 'public',
        required: true,
        beforeValue: function(results) {
          console.log(chalk.yellow('----------------------------------------------------'));
          console.log(util.format('Site URL: https://%s.firebaseapp.com', results.firebase).yellow);
          console.log(chalk.yellow('----------------------------------------------------'));
          console.log('Enter the name of your app\'s public directory.');
          console.log('(usually where you store your index.html file)');
        },
        description: chalk.bold('Public Directory:'),
        default: 'current directory',
        type: 'string',
        before: function(value) {
          if (value === 'current directory') {
            return '.';
          }
        }
      }];

      var getPrompt = function(schema, onComplete, idx, results) {
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
      };

      getPrompt(schema, function(results) {
        if (path.relative('.', results['public']).match(/^\./)) {
          console.log(chalk.red('Public Directory Error') + ' - Public directory must be within current working directory');
          process.exit(1);
        }
        if (!fs.existsSync(results['public'])) {
          console.log(chalk.red('Public Directory Error') + ' - Public directory does not exist');
          process.exit(1);
        }
        var settings = {
          firebase: results.firebase,
          'public': results['public']
        };
        console.log('Initializing app into current directory...');
        auth.checkCanAccess(results.firebase, function(err) {
          if (err) {
            console.log(chalk.red('Permission Error') + ' - You do not have permission to use this Firebase');
            process.exit(1);
          }
          console.log('Writing firebase.json settings file...');
          var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
          try {
            fs.writeFileSync(settingsFile, settingsJSON);
            console.log(chalk.green('Successfully initialized app'));
          } catch (error) {
            console.log(chalk.red('Initialization Error'));
            process.exit(1);
          }
        });
      });

    }, function(error) {
      switch (error.type) {
        case 'LOGIN':
          console.log(chalk.red('Login Error'));
          process.exit(1);
          break;
        default:
          console.log(chalk.red('Initialization Error'));
          process.exit(1);
      }
    });
  },
  bootstrap: function(argv) {
    auth.requireLogin(function(err) {
      if (err) {
        console.log(chalk.red('Login Error'));
        process.exit(1);
      }
      auth.getFirebases(function(err, firebases) {
        if (err) {
          console.log(chalk.red('Initialization Error'));
          process.exit(1);
        }
        if (firebases.length === 0) {
          console.log(chalk.red('No Firebases') + ' - You need to create a Firebase ' +
                        'to bootstrap the app with at https://firebase.com');
          process.exit(1);
        }
        // Firebase names always a subset of ^[0-9a-z-]*$ so safe to regex
        var firebasePattern = new RegExp('^(' + firebases.join('|') + ')$');
        var templatePattern = new RegExp('^(' +
                          Object.keys(supportedTemplates).join('|') + ')$');
        if (!argv.firebase ||
            (typeof(argv.firebase) !== 'string') ||
            !argv.firebase.match(firebasePattern)) {
          console.log('Choose A Firebase\n' +
                      chalk.green('---------- YOUR FIREBASES ----------\n') +
                      firebases.join('\n') +
                      chalk.green('\n------------------------------------'));
        }
        var schema = {
              properties: {
                firebase: {
                  required: true,
                  pattern: firebasePattern,
                  description: 'Firebase:',
                  type: 'string'
                }
              }
            };
        prompt.get(schema, function(err, result) {
          if (err) {
            console.log(chalk.red('User Input Error'));
            process.exit(1);
          }
          var firebase = result.firebase;
          if (!argv.template ||
              (typeof(argv.template) !== 'string') ||
              !argv.template.match(templatePattern)) {
            console.log('Choose A Template\n' +
                        chalk.green('------- AVAILABLE TEMPLATES --------\n') +
                        Object.keys(supportedTemplates).join('\n') +
                        chalk.green('\n------------------------------------'));
          }
          auth.checkCanAccess(firebase, function(err) {
            if (err) {
              console.log(chalk.red('Permission Error') + ' - You do not have ' +
                                    'permission to use this Firebase');
              process.exit(1);
            }
            var schema = {
                  properties: {
                    template: {
                      required: true,
                      pattern: templatePattern,
                      description: 'Template:',
                      type: 'string'
                    }
                  }
                };
            prompt.get(schema, function(err, result) {
              if (err) {
                console.log(chalk.red('USER INPUT ERROR'));
                process.exit(1);
              }
              var dir = firebase;
              var projectDir = path.resolve(dir);
              if (fs.existsSync(projectDir)) {
                var i = 1;
                do {
                  dir = firebase + '_' + i++;
                  projectDir = path.resolve(dir);
                } while (fs.existsSync(projectDir));
              }
              console.log('Bootstrapping into directory \'' + dir + '\'');
              try {
                fs.mkdirSync(projectDir, '0755');
              } catch (err) {
                console.log(chalk.red('Filesystem Error') + ' - Could not create new' +
                              ' directory');
                process.exit(1);
              }

              console.log('Downloading and unpacking template');
              var gunzip = zlib.createGunzip();
              var untar = tar.Extract({
                path: projectDir,
                strip: 1
              });
              try {
                request(supportedTemplates[result.template].url).pipe(gunzip).pipe(untar);
              } catch (err) {
                console.log(chalk.red('Download Error') + ' - Could not download ' +
                              'template');
                process.exit(1);
              }
              untar.on('end', function() {
                var config = path.join(
                               projectDir,
                               supportedTemplates[result.template].config
                             );
                try {
                  var data = fs.readFileSync(config, 'utf8'),
                      realtimeHost = api.realtimeUrl.replace(/\/\//, '//' + firebase + '.');
                  var replaced = data.replace(
                                   supportedTemplates[result.template].configRegex,
                                   realtimeHost
                                 );
                  fs.writeFileSync(config, replaced);
                } catch (err) {
                  console.log(chalk.red('Initialization Error') + ' - Couldn\'t ' +
                                'update template with project settings');
                  process.exit(1);
                }

                console.log('Writing firebase.json settings file');
                var publicPath = supportedTemplates[result.template]
                                .settings['public'].replace(/\//g, path.sep),
                    rulesPath = supportedTemplates[result.template]
                                .settings['rules'].replace(/\//g, path.sep);
                var settings = {
                  'firebase': firebase,
                  'public': publicPath,
                  'rules': rulesPath
                };
                var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
                var settingsFile = path.join(projectDir, 'firebase.json');
                try {
                  fs.writeFileSync(settingsFile, settingsJSON);
                } catch (err) {
                  console.log(chalk.red('Filesystem Error') + ' - Could not save ' +
                    'settings file');
                  process.exit(1);
                }
                console.log(supportedTemplates[result.template].completedMessage);
              });
            });
          });
        });
      });
    });
  },
  deploy: function() {
    auth.requireLogin(function(err) {
      if (err) {
        console.log(chalk.red('LOGIN ERROR'));
        process.exit(1);
      }
      var settingsFile = path.resolve('./firebase.json');
      if (!fs.existsSync(settingsFile)) {
        console.log(chalk.red('Initialization Error') + ' - Directory not ' +
                      'initialized');
        process.exit(1);
      }
      try {
        var settingsJSON = fs.readFileSync(settingsFile),
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
        var deleting = false;
        if (fs.readdirSync(settings['public']).length == 0) {
          console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                          'directory is empty, removing site');
          deleting = true;
        }
        if (tokens.firebaseToken) {
          var firebaseRef = new Firebase(api.realtimeUrl.replace(/\/\//, '//firebase.'));
          firebaseRef.auth(tokens.firebaseToken, function(error, result) {
            if (error) {
              console.log('Firebase authentication failed!');
              process.exit(1);
            }
          });
        }
        var personalToken = tokens.personalToken ? tokens.personalToken : tokens.authToken;
        auth.updateRules(settings.firebase,
                         personalToken,
                         settings.rules,
                         function(statusCode, response) {
          if (response.error) {
            console.log(chalk.red('Security Rules Error') + ' - ' +
                                response.error.replace(/\n$/, ''));
            process.exit(1);
          }
          // TODO: prompt to continue if no index.html?
          upload.send(settings.firebase, settings['public'], function(err, directory) {
            if (err) {
              console.log(chalk.red('Deploy Error') + ' - Couldn\'t upload app');
              console.log(err);
              process.exit(1);
            }
            var bar = null;
            var total = 0;
            if (tokens.firebaseToken) {
              firebaseRef
                  .child('hosting/versions')
                  .child(settings.firebase)
                  .child(directory)
                  .on('value', function(snapshot) {
                var status = snapshot.child('status').val();
                if (status === 'deployed') {
                  console.log(chalk.green('Deployed Successfully') + ' - View your app' +
                                ' at: ' + api.hostingUrl.replace(/\/\//, '//' +
                                  settings.firebase + '.').cyan);
                  process.exit(0);
                } else if (status === 'deploying') {
                  if (!bar && snapshot.hasChild('fileCount')) {
                    total = snapshot.child('fileCount').val();
                    bar = new ProgressBar('  processing [:bar] :percent :etas', {
                      complete: '=',
                      incomplete: ' ',
                      width: Math.max(process.stdout.columns - 30, 20),
                      total: total
                    });
                  }
                  if (bar) {
                    var uploadedCount = snapshot.hasChild('uploadedCount') ? snapshot.child('uploadedCount').val() : 0;
                    bar.update(uploadedCount / total);
                  }
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
            } else {
              console.log(chalk.green('Upload Successful') + ' - Your upload is ' +
                            'processing but will be available at: ' +
                            api.hostingUrl.replace(/\/\//, '//' +
                            settings.firebase + '.').cyan);
            }
          });
        });
      });
    });
  }
};
