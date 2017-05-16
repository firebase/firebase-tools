'use strict';

var _ = require('lodash');
var request = require('request');
var RSVP = require('rsvp');

var getProjectId = require('../getProjectId');

function _makeVary(vary) {
  if (!vary) {
    return 'Accept-Encoding, Authorization, Cookie';
  }

  var varies = vary.split(/, ?/).map(function(v) {
    return v.split('-').map(function(part) { return _.capitalize(part); }).join('-');
  });

  ['Accept-Encoding', 'Authorization', 'Cookie'].forEach(function(requiredVary) {
    if (!_.includes(varies, requiredVary)) {
      varies.push(requiredVary);
    }
  });

  return varies.join(', ');
}

module.exports = function(options) {
  return function(rewrite) {
    var url;
    if (_.includes(options.targets, 'functions')) {
      url = 'http://localhost:' + (options.port + 3) + '/' + getProjectId(options) + '/us-central1/' + rewrite.function;
      console.log(url);
    } else {
      url = 'https://us-central1-' + getProjectId(options) + '.cloudfunctions.net/' + rewrite.function;
    }
    return RSVP.resolve(function(req, res, next) {
      var proxied = request({
        method: req.method,
        qs: req.query,
        url: url + req.url,
        headers: {
          'X-Forwarded-Host': req.headers.host,
          'X-Original-Url': req.url,
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache, no-store'
        },
        followRedirect: false,
        timeout: 60000
      });

      req.pipe(proxied);

      proxied.on('error', function(err) {
        if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
          res.statusCode = 504;
          res.end('Timed out waiting for function to respond.');
        }

        res.statusCode = 500;
        return res.end('An internal error occurred while connecting to Cloud Function "' + rewrite.function + '"');
      });

      return proxied.on('response', function(response) {
        if (
          response.statusCode === 404 &&
          response.headers['x-cascade'] &&
          response.headers['x-cascade'].toUpperCase() === 'PASS'
        ) {
          return next();
        }

        // default to private cache
        if (!response.headers['cache-control']) {
          response.headers['cache-control'] = 'private';
        }

        // don't allow cookies to be set on non-private cached responses
        if (response.headers['cache-control'].indexOf('private') < 0) {
          delete response.headers['set-cookie'];
        }

        response.headers.vary = _makeVary(response.headers.vary);

        return proxied.pipe(res);
      });
    });
  };
};
