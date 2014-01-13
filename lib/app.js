var optimist = require('optimist'),
    http = require('http'),
    https = require('https'),
    argv = optimist.argv,
    fs = require('fs'),
    path = require('path'),
    zlib = require('zlib'),
    tar = require('tar'),
    url = require('url'),
    prompt = require('prompt'),
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
    completedMessage: 'BOOTSTRAPPING SUCCESSFUL - For more information on the' +
                  ' template see https://github.com/firebase/angularFire-seed'
  }
};

var defaultSettings = {
  'public': '.'
}

var routes = {
  init: function() {
    auth.getFirebases(function(err, firebases) {
      if (err) {
        prompt.logger.error('INITIALIZATION ERROR');
        return;
      }
      var settingsFile = path.resolve('./firebase.json');
      if (fs.existsSync(settingsFile)) {
        prompt.logger.error('INITIALIZATION ERROR - ' +
                              'Directory alread initialized');
        return;
      }
      if (firebases.length == 0) {
        prompt.logger.error('NO FIREBASES - ' +
            'Create a Firebase to initialize app with at https://firebase.com');
        return;
      }
      // Firebase names always a subset of ^[0-9a-z-]*$ so safe to regex
      var pattern = new RegExp('^(' + firebases.join('|') + ')$');
      var schema = {
            properties: {
              firebase: {
                required: true,
                pattern: pattern,
                description: '----- YOUR FIREBASES -----\n'.green +
                             firebases.join('\n') +
                             '\n--------------------------\n'.green +
                             'Enter a Firebase',
                message: 'Please enter a valid Firebase name'
              },
              'public': {
                required: true,
                description: 'Public Directory',
                default: defaultSettings['public'],
                message: 'Please enter the path to a directory that contains ' +
                         'static files to be sent to Firebase Hosting on deploy'
              },
              rules: {
                description: 'Security Rules File (none)'
              }
            }
          };
      prompt.get(schema, function(err, result) {
        if (err) {
          prompt.logger.error('USER INPUT ERROR');
          return;
        }
        if (path.relative('.', result['public']).match(/^\./)) {
          prompt.logger.error('PUBLIC DIRECTORY ERROR - Public directory must' +
                                ' be within current working directory');
          return;
        }
        if (!fs.existsSync(result['public'])) {
          prompt.logger.error('PUBLIC DIRECTORY ERROR - Public directory does' +
                                ' not exist');
          return;
        }
        prompt.logger.info('Initializing app into current directory');
        auth.checkCanAccess(result.firebase, function(err) {
          if (err) {
            prompt.logger.error('PERMISSION ERROR - You do not have ' +
                                  'permission to use this Firebase');
            return;
          }
          prompt.logger.info('Writing firebase.json settings file');
          var settings = {
            firebase: result.firebase,
            'public': result['public']
          };
          if (result.rules &&
                fs.existsSync(result.rules) &&
                fs.statSync(result.rules).isFile()) {
            prompt.logger.info('Found rules file');
            settings.rules = result.rules;
          }
          var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
          try {
            fs.writeFileSync(settingsFile, settingsJSON);
            prompt.logger.info('SUCCESSFULLY INITIALIZED APP');
          } catch (err) {
            prompt.logger.error('INITIALIZATION ERROR');
          }
        });
      });
    });
  },
  bootstrap: function() {
    auth.getFirebases(function(err, firebases) {
      if (err) {
        prompt.logger.error('INITIALIZATION ERROR');
        return;
      }
      if (firebases.length == 0) {
        prompt.logger.error('NO FIREBASES - ' +
            'Create a Firebase to bootstrap app with at https://firebase.com');
        return;
      }
      // Firebase names always a subset of ^[0-9a-z-]*$ so safe to regex
      var firebasePattern = new RegExp('^(' + firebases.join('|') + ')$');
      var templatePattern = new RegExp('^(' +
                        Object.keys(supportedTemplates).join('|') + ')$');
      var schema = {
            properties: {
              firebase: {
                required: true,
                pattern: firebasePattern,
                description: '----- YOUR FIREBASES -----\n'.green +
                             firebases.join('\n') +
                             '\n--------------------------\n'.green +
                             'Enter a Firebase',
                message: 'Please enter a valid Firebase name'
              },
              template: {
                required: true,
                pattern: templatePattern,
                description: '------- TEMPLATES --------\n'.green +
                             Object.keys(supportedTemplates).join('\n') +
                             '\n--------------------------\n'.green +
                             'Enter a Template',
                message: 'Please enter a valid template'
              }
            }
          };
      prompt.get(schema, function(err, result) {
        if (err) {
          prompt.logger.error('USER INPUT ERROR');
          return;
        }
        auth.checkCanAccess(result.firebase, function(err) {
          if (err) {
            prompt.logger.error('PERMISSION ERROR - You do not have ' +
                                  'permission to use this Firebase');
            return;
          }
          var dir = result.firebase;
          var projectDir = path.resolve(dir);
          if (fs.existsSync(projectDir)) {
            var i = 1;
            do {
              dir = result.firebase + '_' + i++;
              projectDir = path.resolve(dir);
            } while (fs.existsSync(projectDir));
          }
          prompt.logger.info('Bootstrapping into directory \'' + dir + '\'');
          try {
            fs.mkdirSync(projectDir, '0755');
          } catch (err) {
            prompt.logger.error('FILESYSTEM ERROR - ' +
                                    'Could not create new directory');
            return;
          }

          prompt.logger.info('Downloading and unpacking template');
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
              prompt.logger.error('DOWNLOAD ERROR - ' +
                                      'Could not download template');
              return
            }
            response.on('end', function() {
              var config = path.join(
                             projectDir,
                             supportedTemplates[result.template].config
                           );
              try {
                var data = fs.readFileSync(config, 'utf8'),
                    realtimeHost = api.realtime.protocol + '//' +
                                    result.firebase + '.' +
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
                prompt.logger.error('INITIALIZATION ERROR - ' +
                          'Couldn\'t update template with project settings');
                return;
              }

              prompt.logger.info('Writing firebase.json settings file');
              var publicPath = supportedTemplates[result.template]
                                .settings['public'].replace(/\//g, path.sep),
                  rulesPath = supportedTemplates[result.template]
                                .settings['rules'].replace(/\//g, path.sep);
              var settings = {
                'firebase': result.firebase,
                'public': publicPath,
                'rules': rulesPath
              };
              var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
              var settingsFile = path.join(projectDir, 'firebase.json');
              try {
                fs.writeFileSync(settingsFile, settingsJSON);
              } catch (err) {
                prompt.logger.error('FILESYSTEM ERROR - ' +
                                        'Could not save settings file');
                return;
              }
              prompt.logger.info(
                  supportedTemplates[result.template].completedMessage);
            });
          });
        });
      });
    });
  },
  deploy: function() {
    var settingsFile = path.resolve('./firebase.json');
    if (!fs.existsSync(settingsFile)) {
      prompt.logger.error('INITIALIZATION ERROR - Directory not initialized');
      return;
    }
    try {
      var settingsJSON = fs.readFileSync(settingsFile),
          settings = JSON.parse(settingsJSON);
      if (typeof(settings.firebase) === 'string') {
        auth.checkCanAccess(settings.firebase, function(err, bbToken, bbSite) {
          if (err) {
            prompt.logger.error('PERMISSION ERROR - You do not have ' +
                                  'permission to use this Firebase');
            return;
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
            prompt.logger.error('PUBLIC DIRECTORY ERROR - Public directory must' +
                                  ' be within current working directory');
            return;
          }
          prompt.logger.info('Deploying...');
          bitballoon.deploy(settings, function(err, url) {
            if (err) {
              prompt.logger.error('DEPLOY ERROR - Couldn\'t deploy app');
              return;
            }
            if (settings.rules && fs.existsSync(settings.rules)) {
              try {
                var rulesString = fs.readFileSync(settings.rules),
                    rules = JSON.parse(rulesString);
              } catch (err) {
                var rules = null;
              }
              if (rules) {
                auth.updateRules(settings.firebase, rules, function(err) {
                  if (err) {
                    prompt.logger.error('DEPLOY ERROR - ' +
                                          'Couldn\'t update security rules');
                    return;
                  }
                  prompt.logger.info('DEPLOYED SUCCESSFULLY - ' +
                                        'Check out your app at ' + url);
                });
              } else {
                prompt.logger.error('DEPLOY ERROR - ' +
                                      'Couldn\'t parse security rules');
              }
            } else {
              prompt.logger.info('DEPLOYED SUCCESSFULLY - ' +
                                    'Check out your app at ' + url);
            }
          });
        });
      }
    } catch (err) {
      prompt.logger.error('INITIALIZATION ERROR - ' +
                              'Could not read firebase.json settings file');
    }
  }
};

module.exports = function() {
  if ((argv._.length > 1) && (routes.hasOwnProperty(argv._[1]))) {
    auth.requireLogin(function(err) {
      if (err) {
        prompt.logger.error('LOGIN ERROR');
        return;
      }
      routes[argv._[1]]();
    });
  } else {
    require('./firebase').showHelp();
  }
};
