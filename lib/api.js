var request = require('request'),
    url = require('url'),
    querystring = require('querystring');

var api = {
  realtimeUrl: 'https://firebaseio.com',
  adminUrl: 'https://admin.firebase.com',
  uploadUrl: 'https://hosting.firebase.com',
  hostingUrl: 'https://firebaseapp.com',
  request: function(method, resource, data, authenticate, callback) {

    // Runtime fetch of Auth singleton to prevent circular module dependencies
    var auth = require('./auth');

    if ((typeof(data) === 'undefined') || !data) {
      data = {};
    }

    if ((typeof(authenticate) !== 'undefined') && (authenticate)) {
      data.token = auth.token;
    }

    var validMethods = ['GET', 'PUT', 'POST', 'DELETE'];

    if (validMethods.indexOf(method) < 0) {
      method = 'GET';
    }

    var options = {
      method: method,
      json: true
    };

    var dataString = '';

    if (method === 'GET') {
      dataString = querystring.stringify(data);
      var separator = resource.match(/\?/) ? '&' : '?';
      resource += separator + dataString;
    } else if (Object.keys(data).length > 0) {
      options.body = JSON.stringify(data, null, 2);
    }

    options.url = this.adminUrl + resource;

    request(options, function(err, response, body) {
      if (err) {
        console.log('SERVER ERROR'.red + ' - Please try again');
        process.exit(1);
      }
      setTimeout(callback, 0, response.statusCode, body);
    });
  },
  setRules: function(firebase, rules, authToken, callback) {
    request({
      url: api.realtimeUrl.replace(/\/\//, '//' + firebase + '.') + '/.settings/rules.json?auth=' + authToken,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: rules
    }, function(err, response, body) {
      if (err) {
        console.log('SERVER ERROR'.red + ' - Please try again');
        process.exit(1);
      }
      setTimeout(callback, 0, response.statusCode, body && JSON.parse(body));
    });
  }
};

function possiblyOverride(apiVariable, envVariable) {
  if (typeof(process.env[envVariable]) !== 'undefined') {
    var urlParts = null;
    try {
      urlParts = url.parse(process.env[envVariable]);
    } catch (err) {
      urlParts = null;
    }

    if (urlParts) {
      api[apiVariable] = process.env[envVariable];
    }
  }
}

possiblyOverride('adminUrl', 'FIREBASE_ADMIN_URL');
possiblyOverride('hostingUrl', 'FIREBASE_HOSTING_URL');
possiblyOverride('realtimeUrl', 'FIREBASE_REALTIME_URL');
possiblyOverride('uploadUrl', 'FIREBASE_UPLOAD_URL');

module.exports = api;
