var http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring');

var Api = {
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
    var dataString = querystring.stringify(data);

    if (method === 'GET') {
      var separator = resource.match(/\?/) ? '&' : '?';
      resource += separator + dataString;
    } else if (dataString.length > 0) {
      options.headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
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
        var response = JSON.parse(responseString);
        // TODO: handle auth errors and attempt login/retry
        setTimeout(callback, 0, res.statusCode, response);
      });
    });

    if ((method !== 'GET') && (dataString.length > 0)) {
      req.write(dataString);
    }

    req.end();
  }
}

function initApi() {
  Api._server = {
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
      Api._server.host = urlParts.hostname;
      if (urlParts.protocol === 'https:') {
        Api._server.protocol = https;
        Api._server.port = 443;
      } else {
        Api._server.protocol = http;
        Api._server.port = 80;
      }
      // override port if specified
      if (urlParts.port) {
        Api._server.port = urlParts.port;
      }
    }
  }

  Api.realtime = {
    protocol: 'https:',
    host: 'firebaseio.com'
  };

  if (typeof(process.env['FIREBASE_REALTIME_URL']) !== 'undefined') {
    try {
      var urlParts = url.parse(process.env['FIREBASE_REALTIME_URL']);
    } catch (err) {
      var urlParts = null;
    }

    if (urlParts) {
      Api.realtime.host = urlParts.hostname;
      Api.realtime.protocol = urlParts.protocol;
      if (urlParts.port) {
        Api.realtime.port = urlParts.port;
      }
    }
  }
}

initApi();

module.exports = Api;
