var prompt = require('prompt'),
    fs = require('fs'),
    configFile = process.env['HOME'] + '/.firebaserc',
    Api = require('./api'),
    argv = require('optimist').argv;

var Auth = {
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
        token: this.token
      },
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
      this.loginRequest(function(err, email, token) {
        if (err) {
          that._attemptLogin(tries - 1, callback);
        } else {
          setTimeout(callback, 0, err, email, token);
        }
      });
    } else {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, new Error("Couldn't log in after " + this.maxRetries + ' tries'));
      }
    }
  },
  loginRequest: function(callback) {
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

    prompt.override = argv;
    prompt.message = '';
    prompt.delimiter = '';

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
      rememberMe: true
    };
    Api.request(
      'GET',
      '/account/login',
      data,
      this._handleLogin.bind(this, callback)
    );
  },
  _handleLogin: function(callback, statusCode, response) {
    var token = response.adminToken;
    if (token) {
      this._storeToken(token, callback);
    } else {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, new Error('Email or Password Invalid'));
      }
    }
  },
  _storeToken: function(token, callback) {
    this.token = token;
    var data = {
      email: this.email,
      token: this.token
    };
    var dataString = JSON.stringify(data, null, 2) + "\n";
    try {
      fs.writeFileSync(configFile, dataString);
    } catch(err) {
      if (typeof(callback) === 'function') {
        setTimeout(callback, 0, new Error('Could Not Save Settings'));
      }
      return;
    }
    if (typeof(callback) === 'function') {
      setTimout(callback, 0, null, this.email, this.token);
    }
  }
};

function initAuth() {
  try {
    var data = fs.readFileSync(configFile),
        config;
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
  } catch (err) {
    Auth.token = '';
    Auth.email = '';
  }
}

initAuth();

module.exports = Auth;
