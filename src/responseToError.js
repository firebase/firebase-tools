"use strict";

const _ = require("lodash");
const { FirebaseError } = require("./error");

module.exports = function (response, body) {
  if (response.statusCode < 400) {
    return null;
  }

  if (typeof body === "string") {
    if (response.statusCode === 404) {
      body = {
        error: {
          message: "Not Found",
        },
      };
    } else {
      body = {
        error: {
          message: body,
        },
      };
    }
  }

  if (typeof body !== "object") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  if (!body.error) {
    const errMessage = response.statusCode === 404 ? "Not Found" : "Unknown Error";
    body.error = {
      message: errMessage,
    };
  }

  const message = "HTTP Error: " + response.statusCode + ", " + (body.error.message || body.error);

  let exitCode;
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
    status: response.statusCode,
  });
};
