"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeoutError = exports.timeoutFallback = void 0;
/**
 * Races a promise against a timer, returns a fallback value (without rejecting) when time expires.
 */
async function timeoutFallback(promise, value, timeoutMillis = 2000) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(value), timeoutMillis)),
    ]);
}
exports.timeoutFallback = timeoutFallback;
async function timeoutError(promise, error, timeoutMillis = 5000) {
    if (typeof error === "string")
        error = new Error(error);
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            setTimeout(() => reject(error || new Error("Operation timed out.")), timeoutMillis);
        }),
    ]);
}
exports.timeoutError = timeoutError;
