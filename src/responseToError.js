"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseToError = void 0;
const _ = __importStar(require("lodash"));
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
//# sourceMappingURL=responseToError.js.map