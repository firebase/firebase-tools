'use strict';

var _ = require('lodash');
var FirebaseError = require('./error');

module.exports = function(response, body) {
  if (response.statusCode < 400) {
    return null;
  }
  if (!body.error) {
    body.error = {
      message: 'Unknown Error'
    };
  }

  var message = body.error.message || body.error;

  var exitCode;
  if (response.statusCode >= 500) {
    // 5xx errors are unexpected
    exitCode = 2;
  } else {
    // 4xx errors happen sometimes
    exitCode = 1;
  }

  _.unset(response, 'request.headers');
  return new FirebaseError(message, {
    context: {
      body: body,
      response: response
    },
    exit: exitCode
  });
};
