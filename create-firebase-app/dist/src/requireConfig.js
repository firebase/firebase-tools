"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireConfig = void 0;
const error_1 = require("./error");
/**
 * Rejects if there is no config in `options`.
 */
async function requireConfig(options) {
    return new Promise((resolve, reject) => {
        var _a;
        return options.config
            ? resolve()
            : reject((_a = options.configError) !== null && _a !== void 0 ? _a : new error_1.FirebaseError("Not in a Firebase project directory (could not locate firebase.json)"));
    });
}
exports.requireConfig = requireConfig;
