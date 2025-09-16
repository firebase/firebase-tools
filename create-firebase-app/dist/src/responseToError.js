"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseToError = void 0;
const _ = require("lodash");
const error_1 = require("./error");
function responseToError(response, body, url) {
    if (response.statusCode < 400) {
        return;
    }
    if (typeof body === "string") {
        if (response.statusCode === 404) {
            body = {
                error: {
                    message: "Not Found",
                },
            };
        }
        else {
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
        }
        catch (e) {
            body = {};
        }
    }
    if (!body.error) {
        const errMessage = response.statusCode === 404 ? "Not Found" : "Unknown Error";
        body.error = {
            message: errMessage,
        };
    }
    let message = "HTTP Error: " + response.statusCode + ", " + (body.error.message || body.error);
    if (url) {
        message = "Request to " + url + " had " + message;
    }
    let exitCode;
    if (response.statusCode >= 500) {
        // 5xx errors are unexpected
        exitCode = 2;
    }
    else {
        // 4xx errors happen sometimes
        exitCode = 1;
    }
    _.unset(response, "request.headers");
    return new error_1.FirebaseError(message, {
        context: {
            body: body,
            response: response,
        },
        exit: exitCode,
        status: response.statusCode,
    });
}
exports.responseToError = responseToError;
