var http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring');

var Api = {
  _server: {},
  request: function(method, resource, data, callback) {

    var validMethods = ['GET', 'PUT', 'POST', 'DELETE'];

    if (validMethods.indexOf(method) < 0) {
      method = 'GET';
    }

    var dataString = querystring.stringify(data);

    if ((method === 'GET') && (dataString.length > 0)) {
      var separator = resource.match(/\?/) ? '&' : '?';
      resource += separator + dataString;
    }

    var options = {
      host: this._server.host,
      path: resource,
      port: this._server.port,
      method: method
    };

    var req = this._server.protocol.request(options, function(res) {
      var responseString = '';
      res.setEncoding('utf8');

      res.on('data', function (chunk) {
        responseString += chunk;
      });

      res.on('end', function() {
        var response = JSON.parse(responseString);
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
  }

  if (typeof(process.env['FIREBASE_ADMIN_URL']) !== 'undefined') {
    try {
      var urlParts = url.parse(process.env['FIREBASE_ADMIN_URL']);
    } catch (err) {
      var urlParts = null;
    }

    if (urlParts) {
      Api._server.host = urlParts.hostname;
      if (urlParts.protocol === 'https') {
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
}

initApi();

module.exports = Api;
