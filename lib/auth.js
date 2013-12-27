var prompt = require('prompt'),
    fs = require('fs'),
    configFile = process.env['HOME'] + '/.firebaserc',
    Api = require('./api');

/**
 * Auth-related methods.
 * Stores the current user's credentials and syncs them to disc.
 */
function Auth(argv) {
  try {
    var data = fs.readFileSync(configFile),
        config;
    config = JSON.parse(data);
    if (typeof(config.authToken) === 'string') {
      this.authToken = config.authToken;
    } else {
      this.authToken = '';
    }
    if (typeof(config.email) === 'string') {
      this.email = config.email;
    } else {
      this.email = '';
    }
  } catch (err) {
    this.authToken = '';
    this.email = '';
  }
  this.argv = argv;
}

Auth.prototype.validate = function(successCallback, errorCallback, scope) {
  if (typeof(scope) === 'undefined') {
    var scope = this;
  }
  Api.request('GET',
    '/token/validate',
    {
      token: this.authToken
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
}

Auth.prototype.loginRequest = function(successCallback, errorCallback, scope) {
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

  prompt.override = this.argv;
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
};

var maxRetries = 3;

Auth.prototype.requireLogin = function(successCallback, errorCallback, scope) {
  if (typeof(scope) === 'undefined') {
    var scope = this;
  }
  var that = this;

  this.validate(
    successCallback,
    that.attemptLogin(maxRetries, successCallback, errorCallback, scope),
    scope
  );
};

Auth.prototype.attemptLogin = function(tries, successCallback, errorCallback, scope) {
  var that = this;
  return function() {
    if (tries > 0) {
      if (tries == maxRetries) {
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
};

Auth.prototype.login = function(successCallback, errorCallback, scope) {
  this.attemptLogin(maxRetries, successCallback, errorCallback, scope)();
};

Auth.prototype.authenticate = function(email, password, successCallback, errorCallback, scope) {
  var data = {
        email: email,
        password: password,
        rememberMe: true
      };
  Api.request(
    'GET',
    '/account/login',
    data,
    this.handleLogin(successCallback, errorCallback, scope),
    this
  );
};

Auth.prototype.handleLogin = function(successCallback, errorCallback, scope) {
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
};

Auth.prototype.storeToken = function(token, successCallback, errorCallback, scope) {
  this.authToken = token;
  var data = {
    email: this.email,
    authToken: this.authToken
  };
  var dataString = JSON.stringify(data, null, 2) + "\n";
  fs.writeFile(configFile, dataString, function (err) {
    if (err) {
      if (typeof(errorCallback) === 'function') {
        errorCallback.call(scope);
      }
      return;
    }
    if (typeof(successCallback) === 'function') {
      successCallback.call(scope, data.email, data.authToken);
    }
  });
};

module.exports = Auth;
