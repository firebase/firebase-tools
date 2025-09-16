"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMessage = exports.isBillingError = exports.getError = exports.getErrStatus = exports.isObject = exports.getErrStack = exports.getErrMsg = exports.FirebaseError = void 0;
const lodash_1 = require("lodash");
const DEFAULT_CHILDREN = [];
const DEFAULT_EXIT = 1;
const DEFAULT_STATUS = 500;
class FirebaseError extends Error {
    constructor(message, options = {}) {
        super();
        this.name = "FirebaseError";
        this.children = (0, lodash_1.defaultTo)(options.children, DEFAULT_CHILDREN);
        this.context = options.context;
        this.exit = (0, lodash_1.defaultTo)(options.exit, DEFAULT_EXIT);
        this.message = message;
        this.original = options.original;
        this.status = (0, lodash_1.defaultTo)(options.status, DEFAULT_STATUS);
    }
}
exports.FirebaseError = FirebaseError;
/**
 * Safely gets an error message from an unknown object
 * @param err an unknown error type
 * @param defaultMsg an optional message to return if the err is not Error or string
 * @return An error string
 */
function getErrMsg(err, defaultMsg) {
    if (err instanceof Error) {
        return err.message;
    }
    else if (typeof err === "string") {
        return err;
    }
    else if (defaultMsg) {
        return defaultMsg;
    }
    return JSON.stringify(err);
}
exports.getErrMsg = getErrMsg;
/**
 * Safely gets an error stack (or error message if no stack is available)
 * from an unknown object
 * @param err The potential error object
 * @return a string representing the error stack or the error message.
 */
function getErrStack(err) {
    if (err instanceof Error) {
        return err.stack || err.message;
    }
    return getErrMsg(err);
}
exports.getErrStack = getErrStack;
/**
 * A typeguard for objects
 * @param value The value to check
 */
function isObject(value) {
    return typeof value === "object" && value !== null;
}
exports.isObject = isObject;
/**
 * Safely gets a status from an unknown object if it has one.
 * @param err The error to get the status of
 * @param defaultStatus a default status if there is none
 * @return the err status, a default status or DEFAULT_STATUS
 */
function getErrStatus(err, defaultStatus) {
    if (isObject(err) && err.status && typeof err.status === "number") {
        return err.status;
    }
    return defaultStatus || DEFAULT_STATUS;
}
exports.getErrStatus = getErrStatus;
/**
 * Safely gets an error object from an unknown object
 * @param err The error to get an Error for.
 * @return an Error object
 */
function getError(err) {
    if (err instanceof Error) {
        return err;
    }
    return Error(getErrMsg(err));
}
exports.getError = getError;
/**
 * Checks if a FirebaseError is caused by attempting something
 * that requires billing enabled while billing is not enabled.
 */
function isBillingError(e) {
    return !!e.context?.body?.error?.details?.find((d) => {
        return (d.violations?.find((v) => v.type === "serviceusage/billing-enabled") ||
            d.reason === "UREQ_PROJECT_BILLING_NOT_FOUND");
    });
}
exports.isBillingError = isBillingError;
/**
 * Checks whether an unknown object (such as an error) has a message field
 */
const hasMessage = (e) => !!e?.message;
exports.hasMessage = hasMessage;
//# sourceMappingURL=error.js.map