var prompt = require('prompt'),
    fs = require('fs'),
    path = require('path'),
    Api = require('./api'),
    Firebase = require('./firebase'),
    argv = require('optimist').argv;

var Auth = {
  configFile: path.join(
                (process.env.HOME || process.env.USERPROFILE),
                '.firebaserc'
              ),
  maxRetries: 3,
  requireLogin: function(callback) {
    var that = this;

    this._validate(function(err) {
      if (err) {
        that.login(callback);
      } else {
        setTimeout(callback, 0, null, that.email, that.token);
      }
    });
  },
  _validate: function(callback) {
    Api.request(
      'GET',
      '/token/validate',
      {
        cli: Firebase.version
      },
      true,
      function(statusCode, response) {
        if (typeof(callback) === 'function') {
          if (response.success) {
            setTimeout(callback, 0, null);
          } else {
            setTimeout(callback, 0, new Error('Invalid Token'));
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
      if (tries == this.maxRetries) {
        console.log('You need to be logged in to perform this action');
      } else {
        console.log('Email or password incorrect, please try again');
      }
      this._loginRequest(function(err, email, token) {
        if (err) {
          that._attemptLogin(tries - 1, callback);
        } else {
          setTimeout(callback, 0, err, email, token);
        }
      });
    } else {
      if (typeof(callback) === 'function') {
        setTimeout(
          callback,
          0,
          new Error("Couldn't log in after " + this.maxRetries + ' tries')
        );
      }
    }
  },
  _loginRequest: function(callback) {
    var that = this,
        schema = {
          properties: {
            email: {
              description: 'Email',
              pattern: /@/,
              message: 'Must be a valid email address',
              required: true
            },
            password: {
              description: 'Password',
              hidden: true,
              required: true
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
      cli: Firebase.version
    };
    Api.request(
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
    } else {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, new Error('Email or Password Invalid'));
      }
    }
  },
  saveConfig: function(callback) {
    var data = {
      email: this.email,
      token: this.token,
      bbToken: this.bbToken
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
    if (deleteSettings) {
      try {
        fs.unlinkSync(this.configFile);
      } catch (err) {
        setTimeout(callback, 0, err);
        return;
      }
      setTimeout(callback, 0, null);
    } else {
      this.token = '';
      this.saveConfig(callback);
    }
  },
  checkCanAccess: function(firebase, callback) {
    var url = '/firebase/' + firebase + '/bitballoon';
    Api.request('GET', url, {}, true, function(statusCode, response) {
      if (response.success) {
        setTimeout(callback, 0, null, response.bbSite);
      } else {
        setTimeout(callback, 0, new Error('User cannot access Firebase'));
      }
    });
  },
  updateBitBalloonSiteId: function(firebase, siteId, callback) {
    var url = '/firebase/' + firebase + '/bitballoon';
    Api.request('POST', url, { siteid: siteId }, true, function(statusCode, response) {
      if (response.success) {
        setTimeout(callback, 0, null);
      } else {
        setTimeout(callback, 0, new Error('Could not update BitBalloon site ID'));
      }
    });
  }
};

function initAuth() {
  try {
    var data = fs.readFileSync(Auth.configFile, 'utf8'),
        config = JSON.parse(data);
    if (typeof(config.token) === 'string') {
      Auth.token = config.token;
    } else {
      Auth.token = '';
    }
    if (typeof(config.email) === 'string') {
      Auth.email = config.email;
    } else {
      Auth.email = '';
    }
    if (typeof(config.bbToken) === 'string') {
      Auth.bbToken = config.bbToken;
    } else {
      Auth.bbToken = '';
    }
  } catch (err) {
    Auth.token = '';
    Auth.email = '';
    Auth.bbToken = '';
  }
}

initAuth();

module.exports = Auth;
