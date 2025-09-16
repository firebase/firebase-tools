"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForbiddenError = exports.NotFoundError = void 0;
/** Error that signals that a resource could not be found */
class NotFoundError extends Error {
}
exports.NotFoundError = NotFoundError;
/** Error that signals that a necessary permission was lacking. */
class ForbiddenError extends Error {
}
exports.ForbiddenError = ForbiddenError;
