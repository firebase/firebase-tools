var https = require('https'),
    querystring = require('querystring')

/**
 * Static API methods.
 */
var Api = {
  request: function(method, resource, data, callback, scope) {
    if (typeof(scope) === 'undefined') {
      var scope = this;
    }

    // TODO: Add support for other request types
    if (method !== 'GET') {
      method = 'GET';
    }

    if (method === 'GET') {
      var separator = resource.match(/\?/) ? '&' : '?';
      resource += separator + querystring.stringify(data);
    }

    var options = {
      host: 'admin.firebase.com',
      path: resource,
      port: 443,
      method: method
    };

    var req = https.request(options, function(res) {
      var responseString = '';
      res.setEncoding('utf8');

      res.on('data', function (chunk) {
        responseString += chunk;
      });

      res.on('end', function() {
        var response = JSON.parse(responseString);
        callback.call(scope, res.statusCode, response);
      });
    })

    req.end();
  }
}

module.exports = Api;
