"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkValidTargetFilters = void 0;
const deploy_1 = require("./commands/deploy");
const error_1 = require("./error");
/** Returns targets from `only` only for the specified deploy types. */
function targetsForTypes(only, ...types) {
    return only.filter((t) => {
        if (t.includes(":")) {
            return types.includes(t.split(":")[0]);
        }
        else {
            return types.includes(t);
        }
    });
}
/** Returns true if any target has a filter (:). */
function targetsHaveFilters(...targets) {
    return targets.some((t) => t.includes(":"));
}
/** Returns true if any target doesn't include a filter (:). */
function targetsHaveNoFilters(...targets) {
    return targets.some((t) => !t.includes(":"));
}
const FILTERABLE_TARGETS = new Set([
    "hosting",
    "functions",
    "firestore",
    "storage",
    "database",
    "dataconnect",
    "apphosting",
]);
/**
 * Validates that the target filters in options.only are valid.
 * Throws an error (rejects) if it is invalid.
 */
async function checkValidTargetFilters(options) {
    const only = !options.only ? [] : options.only.split(",");
    return new Promise((resolve, reject) => {
        if (!only.length) {
            return resolve();
        }
        if (options.except) {
            return reject(new error_1.FirebaseError("Cannot specify both --only and --except"));
        }
        const nonFilteredTypes = deploy_1.VALID_DEPLOY_TARGETS.filter((t) => !FILTERABLE_TARGETS.has(t));
        const targetsForNonFilteredTypes = targetsForTypes(only, ...nonFilteredTypes);
        if (targetsForNonFilteredTypes.length && targetsHaveFilters(...targetsForNonFilteredTypes)) {
            return reject(new error_1.FirebaseError("Filters specified with colons (e.g. --only functions:func1,functions:func2) are only supported for functions, hosting, storage, and firestore"));
        }
        const targetsForFunctions = targetsForTypes(only, "functions");
        if (targetsForFunctions.length &&
            targetsHaveFilters(...targetsForFunctions) &&
            targetsHaveNoFilters(...targetsForFunctions)) {
            return reject(new error_1.FirebaseError('Cannot specify "--only functions" and "--only functions:<filter>" at the same time'));
        }
        return resolve();
    });
}
exports.checkValidTargetFilters = checkValidTargetFilters;
//# sourceMappingURL=checkValidTargetFilters.js.map