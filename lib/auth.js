var prompt = require('prompt'),
    fs = require('fs'),
    configFile = process.env['HOME'] + '/.firebaserc',
    Api = require('./api'),
    argv = require('optimist').argv;

var Auth = {
  maxRetries: 3,
  validate: function(successCallback, errorCallback, scope) {
    if (typeof(scope) === 'undefined') {
      var scope = this;
    }
    Api.request('GET',
      '/token/validate',
      {
        token: this.token
      },
      function(statusCode, response) {
        if (response.success) {
          if (typeof(successCallback) === 'function') {
            successCallback.call(scope);
          }
        } else {
          if (typeof(errorCallback) === 'function') {
            errorCallback.call(scope);
          }
        }
      }
    );
  },
  loginRequest: function(successCallback, errorCallback, scope) {
    if (typeof(scope) === 'undefined') {
      var scope = this;
    }
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
        if (typeof(errorCallback) === 'function') {
          errorCallback.call(scope);
        }
        return;
      }
      that.email = result.email;
      that.authenticate(
        result.email,
        result.password,
        successCallback,
        errorCallback,
        scope
      );
    });
  },
  requireLogin: function(successCallback, errorCallback, scope) {
    if (typeof(scope) === 'undefined') {
      var scope = this;
    }
    var that = this;

    this.validate(
      successCallback,
      that.attemptLogin(this.maxRetries, successCallback, errorCallback, scope),
      scope
    );
  },
  attemptLogin: function(tries, successCallback, errorCallback, scope) {
    var that = this;
    return function() {
      if (tries > 0) {
        if (tries == this.maxRetries) {
          console.log('You need to be logged in to perform this action');
        } else {
          console.log('Email or password incorrect, please try again');
        }
        that.loginRequest(
          successCallback,
          that.attemptLogin(tries - 1, successCallback, errorCallback, scope),
          scope
        );
      } else {
        if (typeof(errorCallback) === 'function') {
          errorCallback.call(scope);
        }
      }
    }
  },
  login: function(successCallback, errorCallback, scope) {
    this.attemptLogin(this.maxRetries, successCallback, errorCallback, scope)();
  },
  authenticate: function(email, password, successCallback, errorCallback, scope) {
    var data = {
          email: email,
          password: password,
          rememberMe: true
        };
    Api.request(
      'GET',
      '/account/login',
      data,
      this.handleLogin(successCallback, errorCallback, scope).bind(this)
    );
  },
  handleLogin: function(successCallback, errorCallback, scope) {
    return function(statusCode, response) {
      var token = response.adminToken;
      if (!token) {
        if (typeof(errorCallback) === 'function') {
          errorCallback.call(scope);
        }
        return;
      }
      this.storeToken(token, successCallback, errorCallback, scope);
    }
  },
  storeToken: function(token, successCallback, errorCallback, scope) {
    this.token = token;
    var data = {
      email: this.email,
      token: this.token
    };
    var dataString = JSON.stringify(data, null, 2) + "\n";
    try {
      fs.writeFileSync(configFile, dataString);
    } catch(err) {
      if (typeof(errorCallback) === 'function') {
        errorCallback.call(scope);
      }
      return;
    }
    if (typeof(successCallback) === 'function') {
      successCallback.call(scope, data.email, data.token);
    }
  }
}

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
