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
  'angular': {
    'url': 'https://codeload.github.com/firebase/angularFire-seed/' +
              'legacy.tar.gz/master',
    'settings': {
      'public': 'app',
      'rules': 'config/security-rules.json',
    },
    'config': 'app/js/config.js',
    'configRegex': /https:\/\/INSTANCE\.firebaseio\.com/,
    'completedMessage': 'Done. To run the server, enter the directory and run' +
                          '\n\nnode scripts' + path.sep + 'web-server.js\n'
  }
};

var defaultSettings = {
  'public': '.'
}

var routes = {
  init: function() {
    var settingsFile = path.resolve('./firebase.json');
    if (fs.existsSync(settingsFile)) {
      console.log('Directory already initialized');
      return;
    }
    var schema = {
          properties: {
            firebase: {
              required: true,
              pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9]|)$/,
              description: 'Firebase',
              message: 'Please enter the firebase you wish to associate this ' +
                         'app with'
            }
          }
        };
    prompt.get(schema, function(err, result) {
      if (err) {
        return;
      }
      console.log('Initializing app into current directory');
      auth.checkCanAccess(result.firebase, function(err) {
        if (err) {
          console.log('You do not have permission to use that Firebase');
          return;
        }
        console.log('Writing firebase.json settings file');
        var settings = {};
        for (var i in defaultSettings) {
          if (defaultSettings.hasOwnProperty(i)) {
            settings[i] = defaultSettings[i];
          }
        }
        settings.firebase = result.firebase;
        var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
        try {
          fs.writeFileSync(settingsFile, settingsJSON);
          console.log('Done')
        } catch (err) {
          console.log('Could not initialize app');
        }
      });
    });
  },
  bootstrap: function() {
    var schema = {
          properties: {
            firebase: {
              required: true,
              pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9]|)$/,
              description: 'Firebase',
              message: 'Please enter the firebase you wish to associate this ' +
                       'app with'
            },
            template: {
              required: true,
              pattern: /^[a-z]+$/,
              description: 'Template',
              message: 'Please enter a valid template'
            }
          }
        };
    prompt.get(schema, function(err, result) {
      if (err) {
        return;
      }
      if (!supportedTemplates.hasOwnProperty(result.template)) {
        console.log('Template not supported. Available templates are:');
        console.log(Object.keys(supportedTemplates).join(', '));
        return;
      }
      auth.checkCanAccess(result.firebase, function(err) {
        if (err) {
          console.log('You do not have permission to use that Firebase');
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
        console.log('Creating directory ' + dir);
        try {
          fs.mkdirSync(projectDir, '0755');
        } catch (err) {
          console.log('Could not create new directory');
          return;
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
            console.log('Could not download template');
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
              console.log(err);
              console.log('Couldn\'t update template with project settings');
              return;
            }

            console.log('Writing firebase.json settings file');
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
              console.log('Could not save settings file');
              return;
            }
            console.log(supportedTemplates[result.template].completedMessage);
          });
        });
      });
    });
  },
  deploy: function() {
    var settingsFile = path.resolve('./firebase.json');
    if (!fs.existsSync(settingsFile)) {
      console.log('Directory not initialized');
      return;
    }
    try {
      var settingsJSON = fs.readFileSync(settingsFile),
          settings = JSON.parse(settingsJSON);
      if (typeof(settings.firebase) === 'string') {
        auth.checkCanAccess(settings.firebase, function(err, bbToken, bbSite) {
          if (err) {
            console.log('You don\'t have access to this Firebase');
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
          bitballoon.deploy(settings, function(err, url) {
            if (err) {
              console.log('Couldn\'t deploy app');
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
                    console.log('Couldn\'t update security rules');
                    return;
                  }
                  console.log('Deployed. Check out your app at ' + url);
                });
              } else {
                console.log('Couldn\'t parse security rules');
              }
            } else {
              console.log('Deployed. Check out your app at ' + url);
            }
          });
        });
      }
    } catch (err) {
      console.log('Could not read firebase.json settings file');
    }
  }
};

module.exports = function() {
  if ((argv._.length > 1) && (routes.hasOwnProperty(argv._[1]))) {
    auth.requireLogin(function(err) {
      if (err) {
        console.log("Sorry, we couldn't log you in");
        return;
      }
      routes[argv._[1]]();
    });
  } else {
    require('./firebase').showHelp();
  }
};
