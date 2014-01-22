var http = require('http'),
    https = require('https'),
    fs = require('fs'),
    path = require('path'),
    zlib = require('zlib'),
    tar = require('tar'),
    url = require('url'),
    prompt = require('prompt'),
    open = require('open'),
    bitballoon = require('./bitballoon'),
    auth = require('./auth'),
    api = require('./api');

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
    completedMessage: 'BOOTSTRAPPING SUCCESSFUL'.green + ' - Instructions and' +
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
    completedMessage: 'BOOTSTRAPPING SUCCESSFUL'.green + ' - Instructions and' +
                        ' setup guide here: ' +
                        'https://github.com/firebase/chat-seed'.cyan
  }
};

var defaultSettings = {
  'public': '.'
}

module.exports = {
  init: function(argv) {
    auth.requireLogin(function(err) {
      if (err) {
        console.log('LOGIN ERROR'.red);
        process.exit(1);
      }
      auth.getFirebases(function(err, firebases) {
        if (err) {
          console.log('INITIALIZATION ERROR'.red);
          process.exit(1);
        }
        var settingsFile = path.resolve('./firebase.json');
        if (fs.existsSync(settingsFile)) {
          console.log('INITIALIZATION ERROR'.red + ' - Directory alread ' +
                        'initialized');
          process.exit(1);
        }
        if (firebases.length == 0) {
          console.log('NO FIREBASES'.red + ' - You need to create a Firebase ' +
                        'to initialize the app with at https://firebase.com');
          process.exit(1);
        }
        // Firebase names always a subset of ^[0-9a-z-]*$ so safe to regex
        var pattern = new RegExp('^(' + firebases.join('|') + ')$');
        if (!argv.firebase ||
            (typeof(argv.firebase) !== 'string') ||
            !argv.firebase.match(pattern)) {
          console.log('Choose A Firebase\n' +
                      '---------- YOUR FIREBASES ----------\n'.green +
                      firebases.join('\n') +
                      '\n------------------------------------'.green);
        }
        var schema = {
              properties: {
                firebase: {
                  required: true,
                  pattern: pattern,
                  description: 'Firebase:',
                  type: 'string'
                },
                'public': {
                  required: true,
                  description: 'Public Directory:',
                  default: defaultSettings['public'],
                  type: 'string'
                },
                rules: {
                  description: 'Security Rules File: (none)',
                  type: 'string'
                }
              }
            };
        prompt.get(schema, function(err, result) {
          if (err) {
            console.log('USER INPUT ERROR'.red);
            process.exit(1);
          }
          if (path.relative('.', result['public']).match(/^\./)) {
            console.log('PUBLIC DIRECTORY ERROR'.red + ' - Public directory ' +
                                  'must be within current working directory');
            process.exit(1);
          }
          if (!fs.existsSync(result['public'])) {
            console.log('PUBLIC DIRECTORY ERROR'.red + ' - Public directory ' +
                                  'does not exist');
            process.exit(1);
          }
          var settings = {
            firebase: result.firebase,
            'public': result['public']
          };
          if (result.rules) {
            if (fs.existsSync(result.rules) &&
                fs.statSync(result.rules).isFile()) {
              settings.rules = result.rules;
            } else {
              console.log('INITIALIZATION ERROR'.red + ' - rules file does ' +
                                    'not exist');
              process.exit(1);
            }
          }
          console.log('Initializing app into current directory');
          auth.checkCanAccess(result.firebase, function(err) {
            if (err) {
              console.log('PERMISSION ERROR'.red + ' - You do not have ' +
                                    'permission to use this Firebase');
              process.exit(1);
            }
            console.log('Writing firebase.json settings file');
            var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
            try {
              fs.writeFileSync(settingsFile, settingsJSON);
              console.log('SUCCESSFULLY INITIALIZED APP'.green);
            } catch (err) {
              console.log('INITIALIZATION ERROR'.red);
              process.exit(1);
            }
          });
        });
      });
    });
  },
  bootstrap: function(argv) {
    auth.requireLogin(function(err) {
      if (err) {
        console.log('LOGIN ERROR'.red);
        process.exit(1);
      }
      auth.getFirebases(function(err, firebases) {
        if (err) {
          console.log('INITIALIZATION ERROR'.red);
          process.exit(1);
        }
        if (firebases.length == 0) {
          console.log('NO FIREBASES'.red + ' - You need to create a Firebase ' +
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
                      '---------- YOUR FIREBASES ----------\n'.green +
                      firebases.join('\n') +
                      '\n------------------------------------'.green);
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
            console.log('USER INPUT ERROR'.red);
            process.exit(1);
          }
          var firebase = result.firebase;
          if (!argv.template ||
              (typeof(argv.template) !== 'string') ||
              !argv.template.match(templatePattern)) {
            console.log('Choose A Template\n' +
                        '------- AVAILABLE TEMPLATES --------\n'.green +
                        Object.keys(supportedTemplates).join('\n') +
                        '\n------------------------------------'.green);
          }
          auth.checkCanAccess(firebase, function(err) {
            if (err) {
              console.log('PERMISSION ERROR'.red + ' - You do not have ' +
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
                console.log('USER INPUT ERROR'.red);
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
                console.log('FILESYSTEM ERROR'.red + ' - Could not create new' +
                              ' directory');
                process.exit(1);
              }

              console.log('Downloading and unpacking template');
              var gunzip = zlib.createGunzip();
              var untar = tar.Extract({
                path: projectDir,
                strip: 1
              });
              var urlParts = url.parse(supportedTemplates[result.template].url);
              var protocol, port;
              if (urlParts.protocol === 'https:') {
                protocol = https;
                port = 443;
              } else {
                protocol = http;
                port = 80;
              }
              if (urlParts.port) {
                port = urlParts.port;
              }
              var request = protocol.get({
                host: urlParts.hostname,
                path: urlParts.pathname,
                port: port
              });
              request.on('response', function(response) {
                try {
                  response.pipe(gunzip).pipe(untar);
                } catch (err) {
                  console.log('DOWNLOAD ERROR'.red + ' - Could not download ' +
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
                        realtimeHost = api.realtime.protocol + '//' +
                                        firebase + '.' +
                                        api.realtime.host;
                    if (api.realtime.port) {
                      realtimeHost += ':' + api.realtime.port;
                    }
                    var replaced = data.replace(
                                     supportedTemplates[result.template].configRegex,
                                     realtimeHost
                                   );
                    fs.writeFileSync(config, replaced);
                  } catch (err) {
                    console.log('INITIALIZATION ERROR'.red + ' - Couldn\'t ' +
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
                    console.log('FILESYSTEM ERROR'.red + ' - Could not save ' +
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
    });
  },
  deploy: function() {
    auth.requireLogin(function(err) {
      if (err) {
        console.log('LOGIN ERROR'.red);
        process.exit(1);
      }
      var settingsFile = path.resolve('./firebase.json');
      if (!fs.existsSync(settingsFile)) {
        console.log('INITIALIZATION ERROR'.red + ' - Directory not ' +
                      'initialized');
        process.exit(1);
      }
      try {
        var settingsJSON = fs.readFileSync(settingsFile),
            settings = JSON.parse(settingsJSON);
      } catch (err) {
        console.log('INITIALIZATION ERROR'.red +' - Could not read ' +
                          'firebase.json settings file');
        process.exit(1);
      }
      if (typeof(settings.firebase) !== 'string') {
        console.log('INITIALIZATION ERROR'.red +' - Could not read ' +
                          'firebase.json settings file');
        process.exit(1);
      }
      auth.checkCanAccess(settings.firebase, function(err, bbToken, bbSite) {
        if (err) {
          console.log('PERMISSION ERROR'.red + ' - You do not have ' +
                                'permission to use this Firebase');
          process.exit(1);
        }
        if (bbToken) {
          settings.bbToken = bbToken;
        }
        if (bbSite) {
          settings.bbSite = bbSite;
        }
        for (var i in defaultSettings) {
          if (defaultSettings.hasOwnProperty(i) &&
                !settings.hasOwnProperty(i)) {
            settings[i] = defaultSettings[i];
          }
        }
        if (path.relative('.', settings['public']).match(/^\./)) {
          console.log('PUBLIC DIRECTORY ERROR'.red + ' - public directory' +
                            ' must be within current working directory');
          process.exit(1);
        }
        if (!fs.existsSync(settings['public'])) {
          console.log('PUBLIC DIRECTORY ERROR'.red + ' - Public directory ' +
                                'does not exist');
          process.exit(1);
        }
        if (fs.readdirSync(settings['public']).length == 0) {
          console.log('PUBLIC DIRECTORY ERROR'.red + ' - Public directory ' +
                                'must not be empty');
          process.exit(1);
        }
        auth.updateRules(settings.firebase,
                         settings.rules,
                         function(statusCode, response) {
          if (response.error) {
            console.log('SECURITY RULES ERROR'.red + ' - ' +
                                response.error.replace(/\n$/, ''));
            process.exit(1);
          }
          console.log('Deploying...');
          bitballoon.deploy(settings, function(err, url) {
            if (err) {
              console.log('DEPLOY ERROR'.red + ' - Couldn\'t deploy app');
              console.log(err);
              process.exit(1);
            }
            console.log('DEPLOYED SUCCESSFULLY'.green + ' - View your app' +
                              ' at: ' + url.cyan);
            setTimeout(open, 1000, url);
          });
        });
      });
    });
  }
};
