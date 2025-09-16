"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assert = exports.NotImplementedError = exports.InternalError = exports.UnknownError = exports.NotFoundError = exports.PermissionDeniedError = exports.UnauthenticatedError = exports.InvalidArgumentError = exports.BadRequestError = exports.ApiError = void 0;
const errors_1 = require("exegesis/lib/errors");
// https://cloud.google.com/apis/design/errors#http_mapping
// https://cloud.google.com/identity-platform/docs/use-rest-api#handling_errors
class ApiError extends errors_1.ExtendableError {
    constructor(code, status, message, reasonOrErrors) {
        super(message);
        this.code = code;
        this.status = status;
        this.code = code;
        this.status = status;
        if (typeof reasonOrErrors === "string") {
            this.errors = [{ message, reason: reasonOrErrors }];
        }
        else {
            this.errors = reasonOrErrors;
        }
    }
    toJSON() {
        return { code: this.code, message: this.message, errors: this.errors, status: this.status };
    }
}
exports.ApiError = ApiError;
class BadRequestError extends ApiError {
    constructor(message, reasonOrErrors = [{ message, reason: "invalid", domain: "global" }]) {
        super(400, undefined, message, reasonOrErrors);
    }
}
exports.BadRequestError = BadRequestError;
// Errors below are a subset of the codes below. Add as needed.
// https://cloud.google.com/apis/design/errors#handling_errors
class InvalidArgumentError extends ApiError {
    constructor(message, reasonOrErrors = [{ message, reason: "invalid", domain: "global" }]) {
        super(400, "INVALID_ARGUMENT", message, reasonOrErrors);
    }
}
exports.InvalidArgumentError = InvalidArgumentError;
class UnauthenticatedError extends ApiError {
    constructor(message, reasonOrErrors) {
        super(401, "UNAUTHENTICATED", message, reasonOrErrors);
    }
}
exports.UnauthenticatedError = UnauthenticatedError;
class PermissionDeniedError extends ApiError {
    constructor(message, reasonOrErrors = [{ message, reason: "forbidden", domain: "global" }]) {
        super(403, "PERMISSION_DENIED", message, reasonOrErrors);
    }
}
exports.PermissionDeniedError = PermissionDeniedError;
class NotFoundError extends ApiError {
    constructor(message = "Not Found", reasonOrErrors = "notFound") {
        super(404, "NOT_FOUND", message, reasonOrErrors);
    }
}
exports.NotFoundError = NotFoundError;
class UnknownError extends ApiError {
    constructor(message, reason) {
        super(500, "UNKNOWN", message, reason);
    }
}
exports.UnknownError = UnknownError;
class InternalError extends ApiError {
    constructor(message, reason) {
        super(500, "INTERNAL", message, reason);
    }
}
exports.InternalError = InternalError;
class NotImplementedError extends ApiError {
    constructor(message, reason = "unimplemented") {
        super(501, "NOT_IMPLEMENTED", message, reason);
    }
}
exports.NotImplementedError = NotImplementedError;
/**
 * Asserts that a condition is truthy, or throw BadRequestError with message.
 * @param assertion the condition to be asserted truthy.
 * @param error the error message to be thrown if assertion is falsy.
 */
function assert(assertion, error) {
    if (!assertion) {
        throw new BadRequestError(error);
    }
}
exports.assert = assert;
