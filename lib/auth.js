var prompt = require('prompt'),
    fs = require('fs'),
    path = require('path'),
    api = require('./api'),
    util = require('util'),
    chalk = require('chalk'),
    _when = require('when');

var auth = {
  configFile: path.join(
                (process.env.HOME || process.env.USERPROFILE),
                '.firebaserc'
              ),
  maxRetries: 3,
  requireLogin: function(argv, callback) {
    var that = this;

    if (argv.email && argv.password) {
      this._attemptLogin(argv, this.maxRetries, callback);
    } else if ((this.email.length === 0) || (this.token.length === 0)) {
      console.log('Please sign into your Firebase account to continue...');
      this._attemptLogin(argv, this.maxRetries, callback);
    } else {
      this._validate(function(err) {
        if (err) {
          console.log('Please sign into your Firebase account to continue...');
          that._attemptLogin(argv, that.maxRetries, callback);
        } else {
          setTimeout(callback, 0, null, that.email, that.token);
        }
      });
    }
  },
  _validate: function(callback) {
    api.request(
      'GET',
      '/token/validate',
      {
        cli: require('./firebase').version
      },
      true,
      function(statusCode, response) {
        if (typeof(callback) === 'function') {
          if (typeof(response.error) !== 'undefined') {
            console.log(chalk.red(response.error.message) + ' - Please update to at ' +
                          'least v' + response.minCLI + ' by running ' +
                          chalk.cyan('npm update -g ' + require('./firebase').name));
            process.exit(1);
          } else if (response.valid) {
            setTimeout(callback, 0, null);
          } else {
            setTimeout(callback, 0, new Error('Invalid Access Token'));
          }
        }
      }
    );
  },
  login: function(argv, callback) {
    this._attemptLogin(argv, this.maxRetries, callback);
  },
  _attemptLogin: function(argv, tries, callback) {
    var that = this;
    if (tries > 0) {
      if (tries !== this.maxRetries) {
        if (argv.silent) {
          console.log(chalk.red('Input Error') + ' - Email or password incorrect');
          process.exit(1);
        }
        console.log('Email or password incorrect, please try again');
        delete prompt.override.email;
        delete prompt.override.password;
      }
      this._loginRequest(argv, function(err, email, token) {
        if (err) {
          that._attemptLogin(argv, tries - 1, callback);
        } else {
          setTimeout(callback, 0, null, email, token);
        }
      });
    } else {
      console.log(chalk.red('Login Unsuccessful'));
      process.exit(1);
    }
  },
  _loginRequest: function(argv, callback) {
    var that = this,
        schema = [
            {
              name: 'email',
              description: 'Email:',
              pattern: /@/,
              message: 'Must be a valid email address',
              required: true,
              type: 'string'
            },{
              name: 'password',
              description: 'Password:',
              hidden: true,
              required: true,
              type: 'string'
            }
        ];

    if (this.email.length > 0) {
      schema[0].default = this.email;
    }

    if (argv.silent) {
      for (var i in schema) {
        var item = schema[i];
        if (!prompt.override[item.name] || (item.pattern && !item.pattern.test(prompt.override[item.name]))) {
          console.log(chalk.red('Input Error') + ' - Not enough or invalid parameters specified while in silent mode');
          console.log('Required ' + chalk.bold(item.name) + ' parameter missing or invalid');
          process.exit(1);
        }
      }
    }

    prompt.get(schema, function(err, result) {
      if (err) {
        if (typeof(callback) === 'function') {
          setTimeout(callback, 0, new Error('Error Getting User Input'));
        }
        return;
      }
      that.email = result.email;
      that._authenticate.bind(that)(result.email, result.password, callback);
    });
  },
  _authenticate: function(email, password, callback) {
    var data = {
      email: email,
      password: password,
      rememberMe: true,
      cli: require('./firebase').version
    };
    api.request(
      'GET',
      '/account/login',
      data,
      false,
      this._handleLogin.bind(this, callback)
    );
  },
  _handleLogin: function(callback, statusCode, response) {
    var token = response.adminToken;
    if (token) {
      this.token = token;
      this.saveConfig(callback);
    } else if (typeof(response.error) !== 'undefined') {
      if (typeof(response.minCLI) === 'undefined') {
        if (typeof(callback) === 'function') {
          setTimeout(callback, 0, new Error('Email or Password Invalid'));
        }
      } else {
        console.log(chalk.red(response.error.message) + ' - Please update to at ' +
                      'least v' + response.minCLI + ' by running ' +
                      chalk.cyan('npm update -g ' + require('./firebase').name));
        process.exit(1);
      }
    }
  },
  saveConfig: function(callback) {
    var data = {
      email: this.email,
      token: this.token
    };
    var dataString = JSON.stringify(data, null, 2) + '\n';
    try {
      fs.writeFileSync(this.configFile, dataString);
    } catch (err) {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, new Error('Could Not Save Settings'));
      }
      return;
    }
    if (typeof(callback) === 'function') {
      setTimeout(callback, 0, null, this.email, this.token);
    }
  },
  logout: function(deleteSettings, callback) {
    var that = this;
    this._invalidateToken(function(err) {
      if (err) {
        setTimeout(callback, 0, err);
      }
      if (deleteSettings) {
        try {
          fs.unlinkSync(that.configFile);
        } catch (e) {
          setTimeout(callback, 0, e);
          return;
        }
        setTimeout(callback, 0, null);
      } else {
        that.token = '';
        that.saveConfig(callback);
      }
    });
  },
  _invalidateToken: function(callback) {
    if (this.token.length > 0) {
      var url = '/account/token';
      api.request('DELETE', url, {}, true, function(statusCode, response) {
        setTimeout(callback, 0, null);
      });
    } else {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, null);
      }
    }
  },
  checkCanAccess: function(firebase, callback) {
    var url = '/firebase/' + firebase + '/token';
    api.request('GET', url, {}, true, function(statusCode, response) {
      if (!response.error) {
        setTimeout(callback, 0, null, response);
      } else {
        setTimeout(callback, 0, new Error('Permission Denied'));
      }
    });
  },
  updateRules: function(firebase, authToken, rules, callback) {
    var rulesString;
    if (rules) {
      if (!fs.existsSync(rules)) {
        console.log(chalk.red('Security Rules Error') + ' - specified security' +
                          ' rules file does not exist');
        process.exit(1);
      }
      try {
        rulesString = fs.readFileSync(rules, 'utf8');
      } catch (err) {
        console.log(chalk.red('Security Rules Error') + ' - couldn\'t read security ' +
                          'rules');
        process.exit(1);
      }
      if (rulesString.length === 0) {
        console.log(chalk.red('Security Rules Error') + ' - couldn\'t read security ' +
                          'rules');
        process.exit(1);
      }
      console.log('Updating security rules...');
      api.setRules(firebase, rulesString, authToken, callback);
    } else {
      setTimeout(callback, 0, 200, {});
    }
  },
  getFirebases: function(callback) {
    api.request('GET', '/account', {}, true, function(statusCode, response) {
      if (typeof(response.firebases) !== 'undefined') {
        var firebases = [];
        for (var firebase in response.firebases) {
          if (response.firebases.hasOwnProperty(firebase)) {
            firebases.push(firebase);
          }
        }
        if (typeof(callback) !== 'undefined') {
          setTimeout(callback, 0, null, firebases);
        }
      } else {
        if (typeof(callback) !== 'undefined') {
          setTimeout(callback, 0, new Error('Could not get list of Firebases'));
        }
      }
    });
  },
  getConfig: function() {
    var config = {};
    var data = fs.readFileSync(this.configFile, 'utf8');
    try {
      config = JSON.parse(data);
    } catch (e) {}
    return config;
  },
  listFirebases: function(argv) {
    return _when.promise(function(resolve, reject, notify) {
      auth.requireLogin(argv, function(err) {
        if (err) {
          var error = new Error('Login Unsuccessful');
              error.type = 'LOGIN';
          reject(error);
       } else {
          auth.getFirebases(function(err, firebases) {
            if (err) {
              var error = new Error('Could Not List Firebases');
                  error.type = 'ACCOUNT';
              reject(error);
            } else {
              resolve({
                firebases: firebases,
                showFirebases: function() {
                  console.log(chalk.yellow('----------------------------------------------------'));
                  console.log(chalk.yellow(util.format('Your Firebase Apps %s', auth.email)));
                  console.log(chalk.yellow('----------------------------------------------------'));
                  console.log(firebases.join('\n'));
                  console.log(chalk.yellow('----------------------------------------------------'));
                }
              });
            }
          });
        }
      });
    });
  }
};

function initAuth() {
  try {
    var config = auth.getConfig();
    if (typeof(config.token) === 'string') {
      auth.token = config.token;
    } else {
      auth.token = '';
    }
    if (typeof(config.email) === 'string') {
      auth.email = config.email;
    } else {
      auth.email = '';
    }
  } catch (err) {
    auth.token = '';
    auth.email = '';
  }
}

initAuth();

module.exports = auth;
