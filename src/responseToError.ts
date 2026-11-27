import * as _ from "lodash";

import { FirebaseError } from "./error";

export function responseToError(response: any, body: any, url?: string): FirebaseError | undefined {
  const statusCode: number = (response.statusCode || response.status) as number;
  if (statusCode < 400) {
    return;
  }
  if (typeof body === "string") {
    if (statusCode === 404) {
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
    const errMessage = statusCode === 404 ? "Not Found" : "Unknown Error";
    body.error = {
      message: errMessage,
    };
  }

  let message = "HTTP Error: " + statusCode + ", " + (body.error.message || body.error);
  if (url) {
    message = "Request to " + url + " had " + message;
  }

  let exitCode;
  if (statusCode >= 500) {
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
    status: statusCode,
  });
}
