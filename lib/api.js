var http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring');

var api = {
  _server: {},
  request: function(method, resource, data, authenticate, callback) {

    // Runtime fetch of Auth singleton to prevent circular module dependencies
    var Auth = require('./auth');

    if ((typeof(data) === 'undefined') || !data) {
      var data = {};
    }

    if ((typeof(authenticate) !== 'undefined') && (authenticate)) {
      data.token = Auth.token;
    }

    var validMethods = ['GET', 'PUT', 'POST', 'DELETE'];

    if (validMethods.indexOf(method) < 0) {
      method = 'GET';
    }

    var options = {
      host: this._server.host,
      port: this._server.port,
      method: method
    };

    var dataString = '';

    if (method === 'GET') {
      dataString = querystring.stringify(data);
      var separator = resource.match(/\?/) ? '&' : '?';
      resource += separator + dataString;
    } else if (Object.keys(data).length > 0) {
      dataString = JSON.stringify(data, null, 2);
      options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString)
      };
    }

    options.path = resource;

    var req = this._server.protocol.request(options, function(res) {
      var responseString = '';
      res.setEncoding('utf8');

      res.on('data', function (chunk) {
        responseString += chunk;
      });

      res.on('end', function() {
        try {
          var response = JSON.parse(responseString);
        } catch (err) {
          console.log('SERVER ERROR'.red + ' - Please try again');
          process.exit(1);
        }
        setTimeout(callback, 0, res.statusCode, response);
      });
    });

    if ((method !== 'GET') && (dataString.length > 0)) {
      req.write(dataString);
    }

    req.end();
  },
  setRules: function(firebase, rules, authToken, callback) {
    var options = {
      port    : api.realtime.port,
      host    : firebase + '.' + this.realtime.host,
      path    : '/.settings/rules.json?auth=' + authToken,
      method  : 'PUT',
      headers : {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rules)
      }
    }

    var req = this.realtime.protocolObject.request(options, function(res) {
      var responseString = '';
      res.setEncoding('utf8');

      res.on('data', function (chunk) {
        responseString += chunk;
      });

      res.on('end', function() {
        try {
          var response = JSON.parse(responseString);
        } catch (err) {
          console.log('SERVER ERROR'.red + ' - Please try again');
          process.exit(1);
        }
        setTimeout(callback, 0, res.statusCode, response);
      });
    });

    req.write(rules);

    req.end();
  }
}

function initApi() {
  api._server = {
    host: 'admin.firebase.com',
    port: 443,
    protocol: https
  };

  if (typeof(process.env['FIREBASE_ADMIN_URL']) !== 'undefined') {
    try {
      var urlParts = url.parse(process.env['FIREBASE_ADMIN_URL']);
    } catch (err) {
      var urlParts = null;
    }

    if (urlParts) {
      api._server.host = urlParts.hostname;
      if (urlParts.protocol === 'https:') {
        api._server.protocol = https;
        api._server.port = 443;
      } else {
        api._server.protocol = http;
        api._server.port = 80;
      }
      // override port if specified
      if (urlParts.port) {
        api._server.port = urlParts.port;
      }
    }
  }

  api.realtime = {
    protocol: 'https:',
    protocolObject: https,
    port: 443,
    host: 'firebaseio.com'
  };

  if (typeof(process.env['FIREBASE_REALTIME_URL']) !== 'undefined') {
    try {
      var urlParts = url.parse(process.env['FIREBASE_REALTIME_URL']);
    } catch (err) {
      var urlParts = null;
    }

    if (urlParts) {
      api.realtime.host = urlParts.hostname;
      api.realtime.protocol = urlParts.protocol;
      if (api.realtime.protocol === 'http:') {
        api.realtime.protocolObject = http;
        api.realtime.port = 80;
      }
      if (urlParts.port) {
        api.realtime.port = urlParts.port;
      }
    }
  }
}

initApi();

module.exports = api;
