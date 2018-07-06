"use strict";

var _ = require("lodash");
var FirebaseError = require("./error");

module.exports = function(response, body) {
  if (typeof body === "string" && response.statusCode === 404) {
    body = {
      error: {
        message: "Not Found",
      },
    };
  }

  if (response.statusCode < 400) {
    return null;
  }

  if (typeof body !== "object") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  if (!body.error) {
    var message = response.statusCode === 404 ? "Not Found" : "Unknown Error";
    body.error = {
      message: message,
    };
  }

  var message = "HTTP Error: " + response.statusCode + ", " + (body.error.message || body.error);

  var exitCode;
  if (response.statusCode >= 500) {
    // 5xx errors are unexpected
    exitCode = 2;
  } else {
    // 4xx errors happen sometimes
    exitCode = 1;
  }

  _.unset(response, "request.headers");
  return new FirebaseError(message, {
    context: {
      body: body,
      response: response,
    },
    exit: exitCode,
  });
};
