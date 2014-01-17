var prompt = require('prompt'),
    fs = require('fs'),
    path = require('path'),
    api = require('./api');

var auth = {
  configFile: path.join(
                (process.env.HOME || process.env.USERPROFILE),
                '.firebaserc'
              ),
  maxRetries: 3,
  requireLogin: function(callback) {
    var that = this;

    if ((this.email.length === 0) || (this.token.length === 0)) {
      console.log('Login required');
      this._attemptLogin(this.maxRetries, callback);
    } else {
      this._validate(function(err) {
        if (err) {
          console.log('Login required');
          that._attemptLogin(that.maxRetries, callback);
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
          if (response.success) {
            setTimeout(callback, 0, null);
          } else if (response.minCLI) {
            console.log('OUTDATED CLI VERSION'.red + ' - Please update to at ' +
                          'least v' + response.minCLI);
            process.exit(1);
          } else {
            setTimeout(callback, 0, new Error('Invalid Access Token'));
          }
        }
      }
    );
  },
  login: function(callback) {
    this._attemptLogin(this.maxRetries, callback);
  },
  _attemptLogin: function(tries, callback) {
    var that = this;
    if (tries > 0) {
      if (tries !== this.maxRetries) {
        console.log('Email or password incorrect, please try again');
      }
      this._loginRequest(function(err, email, token) {
        if (err) {
          that._attemptLogin(tries - 1, callback);
        } else {
          setTimeout(callback, 0, null, email, token);
        }
      });
    } else {
      console.log('LOGIN UNSUCCESSFUL'.red);
      process.exit(1);
    }
  },
  _loginRequest: function(callback) {
    var that = this,
        schema = {
          properties: {
            email: {
              description: 'Email:',
              pattern: /@/,
              message: 'Must be a valid email address',
              required: true,
              type: 'string'
            },
            password: {
              description: 'Password:',
              hidden: true,
              required: true,
              type: 'string'
            }
          }
        };

    if (this.email.length > 0) {
      schema.properties.email.default = this.email;
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
    } else if (response.minCLI) {
      console.log('OUTDATED CLI VERSION'.red + ' - Please update to at least ' +
                      'v' + response.minCLI);
      process.exit(1);
    } else {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, new Error('Email or Password Invalid'));
      }
    }
  },
  saveConfig: function(callback) {
    var data = {
      email: this.email,
      token: this.token
    };
    var dataString = JSON.stringify(data, null, 2) + "\n";
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
        } catch (err) {
          setTimeout(callback, 0, err);
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
      var url = '/account/token/' + this.token;
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
    var url = '/firebase/' + firebase + '/bitballoon';
    api.request('GET', url, {}, true, function(statusCode, response) {
      if (response.success) {
        setTimeout(callback, 0, null, response.bbToken, response.bbSite);
      } else {
        setTimeout(callback, 0, new Error('Permission Denied'));
      }
    });
  },
  updateBitBalloonSiteId: function(firebase, siteId, callback) {
    var url = '/firebase/' + firebase + '/bitballoon';
    api.request('PUT', url, { siteid: siteId }, true, function(statusCode, response) {
      if (response.success) {
        setTimeout(callback, 0, null, response.url);
      } else {
        setTimeout(callback, 0, new Error('Could not update BitBalloon site ID'));
      }
    });
  },
  updateRules: function(firebase, rules, callback) {
    if (rules) {
      if (!fs.existsSync(rules)) {
        console.log('SECURITY RULES ERROR'.red + ' - specified security' +
                          ' rules file does not exist');
        process.exit(1);
      }
      try {
        var rulesString = fs.readFileSync(rules, 'utf8');
      } catch (err) {
        console.log('SECURITY RULES ERROR'.red + ' - couldn\'t read security ' +
                          'rules');
        process.exit(1);
      }
      if (rulesString.length == 0) {
        console.log('SECURITY RULES ERROR'.red + ' - couldn\'t read security ' +
                          'rules');
        process.exit(1);
      }
      console.log('Updating security rules...');
      var url = '/firebase/' + firebase + '/token';
      api.request('GET', url, {}, true, function(statusCode, response) {
        if (response.error) {
          console.log('SECURITY RULES ERROR'.red + ' - ' + response.error);
          process.exit(1);
        }
        if (!response.authToken) {
          console.log('SECURITY RULES ERROR'.red + ' - Could not authenticate');
          process.exit(1);
        }
        api.setRules(firebase, rulesString, response.authToken, callback);
      });
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
  }
};

function initAuth() {
  try {
    var data = fs.readFileSync(auth.configFile, 'utf8'),
        config = JSON.parse(data);
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
