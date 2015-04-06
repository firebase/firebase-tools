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
    _when = require('when');

var defaultSettings = {
  'public': '.',
  'ignore': ['firebase.json', '**/.*', '**/node_modules/**']
};

function getPrompt(argv, schema, onComplete, index, results) {
  if (!Array.isArray(schema)) {
    console.log(chalk.red('An error occurred'));
    process.exit(1);
  }
  onComplete = typeof onComplete !== 'function' ? function() {} : onComplete;
  index = typeof index !== 'number' ? 0 : index;
  results = typeof results !== 'object' ? {} : results;
  var item = schema[index];
  if (argv.silent) {
    if (!prompt.override[item.name] || (item.pattern && !item.pattern.test(prompt.override[item.name]))) {
      console.log(chalk.red('Input Error') + ' - Not enough or invalid parameters specified while in silent mode');
      console.log('Required ' + chalk.bold(item.name) + ' parameter missing or invalid');
      process.exit(1);
    }
  }
  if (typeof item.beforeValue === 'function') {
    item.beforeValue(results);
  }
  prompt.get(schema[index], function(error, result) {
    if (error) {
      console.log(chalk.red('Input Error'));
      process.exit(1);
    }
    results[item.name] = result[item.name];
    if (++index < schema.length) {
      getPrompt(argv, schema, onComplete, index, results);
    } else {
      onComplete(results);
    }
  });
}

function updateRules(settings, tokens) {
  return _when.promise(function(resolve, reject, notify) {
    auth.updateRules(settings.firebase,
                     tokens.personalToken,
                     settings.rules,
                     function(statusCode, response) {
      if (statusCode !== 200 || response.error) {
        console.log(chalk.red('Security Rules Error') + ' - ' +
                            response.error.replace(/\n$/, ''));
        process.exit(1);
      }
      resolve();
    });
  });
}

function updateRedirects(firebaseRef, settings) {
  return _when.promise(function(resolve, reject, notify) {
    firebaseRef.child('hosting/path-redirects').child(settings.firebase).set(settings.redirects, function(err) {
      if (err) {
        console.log(chalk.red('Settings Error') + ' - Incorrectly formatted "redirects" entry in the firebase.json');
        process.exit(1);
      }
      resolve();
    });
  });
}

function updateRewrites(firebaseRef, settings) {
  return _when.promise(function(resolve, reject, notify) {
    firebaseRef.child('hosting/rewrites').child(settings.firebase).set(settings.rewrites, function(err) {
      if (err) {
        console.log(chalk.red('Settings Error') + ' - Incorrectly formatted "rewrites" entry in the firebase.json');
        process.exit(1);
      }
      resolve();
    });
  });
}

function updateHeaders(firebaseRef, settings) {
  return _when.promise(function(resolve, reject, notify) {
    firebaseRef.child('hosting/headers').child(settings.firebase).set(settings.headers, function(err) {
      if (err) {
        console.log(chalk.red('Settings Error') + ' - Incorrectly formatted "headers" entry in the firebase.json');
        process.exit(1);
      }
      resolve();
    });
  });
}

function validateRedirects(redirects) {
  var error = null;
  if (redirects) {
    if (!Array.isArray(redirects)) {
      error = 'Redirects entry in the firebase.json must be an Array.';
    } else {
      for (var i = 0; i < redirects.length; i++) {
        var redirect = redirects[i];
        if (typeof redirect !== 'object') {
          error = 'Redirect rule: ' + JSON.stringify(redirect) + ' Must be an object.';
        } else if (!redirect.source || typeof redirect.source !== 'string' || redirect.source.length === 0) {
          error = 'Redirect rule: ' + JSON.stringify(redirect) + ' Must contain a "source" attribute that\'s a non-empty string.';
        } else if (!redirect.destination || typeof redirect.destination !== 'string' || redirect.destination.length === 0) {
          error = 'Redirect rule: ' + JSON.stringify(redirect) + ' Must contain a "destination" attribute that\'s a non-empty string.';
        } else if (!/^(\/[^\s]*|https?:\/\/[^\s]+)$/.test(redirect.destination)) {
          error = 'Redirect destination: "' + redirect.destination + '" Must be a remote or absolute url and start with "http", "https", or a "/".';
        } else if (redirect.type !== 301 && redirect.type !== 302) {
          error = 'Redirect rule: ' + JSON.stringify(redirect) + ' Must have a redirect "type" that\'s either 301 for a permanent redirect or 302 for a temporary redirect.';
        } else if (Object.keys(redirect).length > 3) {
          error = 'Redirect rule: ' + JSON.stringify(redirect) + ' Must not contain any keys other than "source", "destination", or "type".';
        }
        if (error) {
          break;
        }
      }
    }
  }
  if (error) {
    console.log(chalk.red('Settings Error') + ' - ' + error);
    process.exit(1);
  }
}

function validateRewrites(rewrites) {
  var error = null;
  if (rewrites) {
    if (!Array.isArray(rewrites)) {
      error = 'Rewrites entry in the firebase.json must be an Array.';
    } else {
      for (var i = 0; i < rewrites.length; i++) {
        var rewrite = rewrites[i];
        if (typeof rewrite !== 'object') {
          error = 'Rewrite rule: ' + JSON.stringify(rewrite) + ' Must be an object.';
        } else if (!rewrite.source || typeof rewrite.source !== 'string' || rewrite.source.length === 0) {
          error = 'Rewrite rule: ' + JSON.stringify(rewrite) + ' Must contain a "source" attribute that\'s a non-empty string.';
        } else if (!rewrite.destination || typeof rewrite.destination !== 'string' || rewrite.destination.length === 0) {
          error = 'Rewrite rule: ' + JSON.stringify(rewrite) + ' Must contain a "destination" attribute that\'s a non-empty string.';
        } else if (!/^\/[^\s]*[^\/\s]$/.test(rewrite.destination)) {
          error = 'Rewrite destination: "' + rewrite.destination + '" Must be an absolute path to a file that starts with a "/" and does not end in a "/".';
        } else if (Object.keys(rewrite).length > 2) {
          error = 'Rewrite rule: ' + JSON.stringify(rewrite) + ' Must not contain any keys other than "source" or "destination".';
        }
        if (error) {
          break;
        }
      }
    }
  }
  if (error) {
    console.log(chalk.red('Settings Error') + ' - ' + error);
    process.exit(1);
  }
}

function validateHeaders(headers) {
  var error = null,
      supportedHeaders = [
        'Access-Control-Allow-Origin',
        'Cache-Control',
        'X-UA-Compatible',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection'
      ];
  if (headers) {
    if (!Array.isArray(headers)) {
      error = 'Headers entry in the firebase.json must be an Array.';
    } else {
      for (var i = 0; i < headers.length; i++) {
        var header = headers[i];
        if (typeof header !== 'object') {
          error = 'Header rule: ' + JSON.stringify(header) + ' Must be an object.';
        } else if (!header.source || typeof header.source !== 'string' || header.source.length === 0) {
          error = 'Header rule: ' + JSON.stringify(header) + ' Must contain a "source" attribute that\'s a non-empty string.';
        } else if (!header.headers || !Array.isArray(header.headers)) {
          error = 'Header rule: ' + JSON.stringify(header) + ' Must contain a "headers" attribute that\'s an array.';
        } else if (Object.keys(header).length > 2) {
          error = 'Header rule: ' + JSON.stringify(header) + ' Must not contain any keys other than "source" or "headers".';
        }
        if (!error) {
          for (var j = 0; j < header.headers.length; j++) {
            var individualHeader = header.headers[j];
            if (typeof individualHeader !== 'object') {
              error = 'Header: ' + JSON.stringify(individualHeader) + ' Must be an object';
            } else if (!individualHeader.key || typeof individualHeader.key !== 'string' || individualHeader.key.length === 0) {
              error = 'Header: ' + JSON.stringify(individualHeader) + ' Must contain a "key" field that\'s one of: "' + supportedHeaders.join('", "') + '"';
            } else if (!individualHeader.value || typeof individualHeader.value !== 'string' || individualHeader.value.length === 0) {
              error = 'Header: ' + JSON.stringify(individualHeader) + ' Must contain a "value" field that\'s a non-empty string.';
            } else if (supportedHeaders.indexOf(individualHeader.key) < 0) {
              error = 'Header key: "' + individualHeader.key + '" is not supported. Supported keys are: "' + supportedHeaders.join('", "') + '"';
            } else if (Object.keys(individualHeader).length > 2) {
              error = 'Header: ' + JSON.stringify(individualHeader) + ' Must not contain any keys other than "key" or "value".';
            }
            if (error) {
              break;
            }
          }
        }
        if (error) {
          break;
        }
      }
    }
  }
  if (error) {
    console.log(chalk.red('Settings Error') + ' - ' + error);
    process.exit(1);
  }
}

function handleFailedDeploy(defaultError) {
  return function(err) {
    if (err) {
      var detailedMessage = chalk.red('Deploy Error') + ' - ';
      if (typeof(err.message) !== 'undefined') {
        detailedMessage += err.message + ' ';
      }
      if (typeof(err.details) !== 'undefined') {
        detailedMessage += err.details;
      }
      if (detailedMessage.length === 0) {
        detailedMessage = defaultError;
      }
      console.log(detailedMessage);
      process.exit(1);
    }
  };
}

function uploadSite(settings, directoryRef, argv) {
  return function() {
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
          bar.update(Math.floor(100 * uploadedCount / total) / 100);
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

    upload.send(settings.firebase, settings.public, settings.ignore, directoryRef.key(), message, handleFailedDeploy('Couldn\'t upload site'));
  };
}

function getSettings(argv) {
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
    console.log(chalk.red('Initialization Error') + ' - Could not read ' +
                      'firebase.json settings file');
    process.exit(1);
  }
  util._extend(settings, argv);

  return settings;
}

function mkDirs(filePath) {
  var filePathParts = filePath.split(path.sep);
  for (var i = 1; i < filePathParts.length; i++) {
    var folderPath = filePathParts.slice(0, i).join(path.sep);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
  }
}

module.exports = {
  init: function(argv) {
    auth.listFirebases(argv).then(function(res) {

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

      getPrompt(argv, schema, function(results) {
        if (path.relative('.', results.public).match(/^\./)) {
          console.log(chalk.red('init cancelled - the public directory must be within the current working directory'));
          process.exit(1);
        }
        if (!fs.existsSync(results.public)) {
          console.log(chalk.red('init cancelled - the directory you entered does not exist'));
          process.exit(1);
        }
        var settings = {
          'firebase': results.firebase,
          'public': results.public,
          'ignore': defaultSettings.ignore
        };
        console.log('Initializing app into current directory...');
        auth.checkCanAccess(results.firebase, function(err) {
          if (err) {
            console.log(chalk.red('Permission Error') + ' - you do not have permission to use this Firebase');
            process.exit(1);
          }
          console.log('Writing firebase.json settings file...');
          var settingsJSON = JSON.stringify(settings, null, 2) + '\n';
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
    _when.join(this.getTemplates(), auth.listFirebases(argv)).done(function(resultSet) {
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

            var longestTemplateLength = 0;
            for (var i = 0; i < templateList.length; i++) {
              if (templateList[i].length > longestTemplateLength) {
                longestTemplateLength = templateList[i].length;
              }
            }
            for (var j = 0; j < templateList.length; j++) {
              var key = templateList[j],
                  template = supportedTemplates[key];
              var output = chalk.bold(key);
              if (template.description) {
                var spacingString = '';
                for (var k = longestTemplateLength; k > key.length; k--) {
                  spacingString += ' ';
                }
                output += spacingString + ' - ' + template.description;
              }
              console.log(output);
            }

            console.log(chalk.yellow('----------------------------------------------------'));
            console.log('Choose a template to help you get started with your app');
          }
        },
        description: chalk.bold('Template:'),
        type: 'string'
      }];

      getPrompt(argv, schema, function(results) {
        var firebase = results.firebase;
        var dir = firebase;
        var projectDir = path.resolve(dir);
        if (fs.existsSync(projectDir)) {
          var i = 1;
          do {
            dir = firebase + '_' + i++;
            projectDir = path.resolve(dir);
          } while (fs.existsSync(projectDir));
        }

        results.directory = dir;
        console.log('Bootstrapping into directory \'' + dir + '\'...');

        // Load the project root if defined, and gracefully handle missing '/'
        var templateRoot = (supportedTemplates[results.template].templateRoot || '/').replace(/\//g, path.sep);
        if (templateRoot.length > 0 && templateRoot[0] === path.sep) {
          templateRoot = templateRoot.slice(1);
        }
        if (templateRoot.length > 1 && templateRoot.slice(-1) !== path.sep) {
          templateRoot += path.sep;
        }

        console.log('Downloading and unpacking template...');
        var gunzip = zlib.createGunzip();
        var untar = tar.Parse();

        var outStandingFiles = 1;

        function fileFinished() {
          outStandingFiles -= 1;
          if (outStandingFiles <= 0) {
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
              'public': defaultSettings.public,
              'ignore': defaultSettings.ignore
            };

            if (supportedTemplates[results.template].settings) {
              if (supportedTemplates[results.template].settings.public) {
                settings.public = supportedTemplates[results.template].settings.public;
              }
              if (supportedTemplates[results.template].settings.rules) {
                settings.rules = supportedTemplates[results.template].settings.rules;
              }
              if (supportedTemplates[results.template].settings.ignore) {
                settings.ignore = supportedTemplates[results.template].settings.ignore;
              }
            }

            var settingsJSON = JSON.stringify(settings, null, 2) + '\n';
            var settingsFile = path.join(projectDir, 'firebase.json');
            try {
              fs.writeFileSync(settingsFile, settingsJSON);
            } catch (err) {
              console.log(chalk.red('Filesystem Error') + ' - Could not save settings file');
              process.exit(1);
            }

            console.log(chalk.green('Successfully added template'));
            console.log('To deploy: %s then %s', chalk.bold(util.format('cd %s', results.directory + path.sep)), chalk.bold('firebase deploy'));
          }
        }

        var extraction = request(supportedTemplates[results.template].tarball).pipe(gunzip).pipe(untar);

        extraction.on('error', function(err) {
          console.log(chalk.red('Download Error') + ' - Could not download ' +
                        'template');
          process.exit(1);
        });

        extraction.on('entry', function(entry) {
          if (entry.type === 'File') {
            var key = path.normalize(entry.path).split(path.sep).slice(1).join(path.sep);
            var pattern = new RegExp('^' + templateRoot.replace(/\\/g, '\\\\') + '(.+)$');
            var match = key.match(pattern);
            if (match && match.length > 1) {
              outStandingFiles += 1;
              var outputPath = dir + path.sep + match[1];
              mkDirs(outputPath);
              entry.pipe(fs.createWriteStream(outputPath)).on('finish', fileFinished);
            }
          }
        });

        extraction.on('end', fileFinished);
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
    auth.requireLogin(argv, function(err) {
      if (err) {
        console.log(chalk.red('Login Error'));
        process.exit(1);
      }
      var settings = getSettings(argv);
      if (typeof(settings.firebase) !== 'string') {
        console.log(chalk.red('Initialization Error') + ' - Could not read ' +
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
        if (path.relative('.', settings.public).match(/^\.\./)) {
          console.log(chalk.red('Public Directory Error') + ' - public directory' +
                            ' must be within current working directory');
          process.exit(1);
        }
        if (!fs.existsSync(settings.public)) {
          console.log(chalk.red('Public Directory Error') + ' - Public directory ' +
                                'does not exist');
          process.exit(1);
        }

        settings.rewrites = settings.rewrites || null;
        validateRewrites(settings.rewrites);
        settings.redirects = settings.redirects || null;
        validateRedirects(settings.redirects);
        settings.headers = settings.headers || null;
        validateHeaders(settings.headers);

        var firebaseRef = new Firebase(api.realtimeUrl.replace(/\/\//, '//firebase.'));
        firebaseRef.authWithCustomToken(tokens.firebaseToken, function(error, result) {
          if (error) {
            console.log('Firebase authentication failed!');
            process.exit(1);
          }
        });
        var directoryRef = firebaseRef
                .child('hosting/versions')
                .child(settings.firebase)
                .push();

        _when.join(updateRules(settings, tokens),
                   updateRedirects(firebaseRef, settings),
                   updateRewrites(firebaseRef, settings),
                   updateHeaders(firebaseRef, settings))
             .done(uploadSite(settings, directoryRef, argv));
      });
    });
  },
  deleteSite: function(argv) {
    auth.requireLogin(argv, function(err) {
      if (err) {
        console.log(chalk.red('Login Error'));
        process.exit(1);
      }
      var settings = getSettings(argv);
      if (typeof(settings.firebase) !== 'string') {
        console.log(chalk.red('Initialization Error') + ' - Could not read ' +
                          'firebase.json settings file');
        process.exit(1);
      }
      auth.checkCanAccess(settings.firebase, function(err, tokens) {
        if (err) {
          console.log(chalk.red('Permission Error') + ' - You do not have ' +
                                'permission to use this Firebase');
          process.exit(1);
        }
        var firebaseRef = new Firebase(api.realtimeUrl.replace(/\/\//, '//firebase.'));
        firebaseRef.authWithCustomToken(tokens.firebaseToken, function(error, result) {
          if (error) {
            console.log('Firebase authentication failed!');
            process.exit(1);
          }
        });
        var directoryRef = firebaseRef
                .child('hosting/versions')
                .child(settings.firebase)
                .push();
        directoryRef.on('value', function(snapshot) {
          var status = snapshot.child('status').val();
          if (status === 'removed') {
            console.log(chalk.green('Sucessfully removed'));
            process.exit(0);
          } else if (status === 'failed') {
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

        upload.deleteSite(settings.firebase, directoryRef.key(), message, handleFailedDeploy('Couldn\'t delete site'));
      });
    });
  },
  open: function(argv) {
    var settings = getSettings(argv);
    if (typeof(settings.firebase) !== 'string') {
      console.log(chalk.red('Initialization Error') + ' - Could not read ' +
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
