'use strict';

var FirebaseError = require('./error');

module.exports = function(response, body, options) {
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

  return new FirebaseError(message, {
    context: {
      requestOptions: options,
      body: body,
      response: response
    },
    exit: exitCode
  });
};
