"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneUndefiends = exports.formatServiceAccount = exports.getInvokerMembers = exports.fieldMasks = exports.renameIfPresent = exports.convertIfPresent = exports.copyIfPresent = exports.assertOneOf = exports.durationFromSeconds = exports.secondsFromDuration = void 0;
const error_1 = require("../error");
/** Get the number of seconds in a google.protobuf.Duration. */
function secondsFromDuration(d) {
    return +d.slice(0, d.length - 1);
}
exports.secondsFromDuration = secondsFromDuration;
/** Get a google.protobuf.Duration for a number of seconds. */
function durationFromSeconds(s) {
    return `${s}s`;
}
exports.durationFromSeconds = durationFromSeconds;
/**
 * Throws unless obj contains at no more than one key in "fields".
 * This verifies that proto oneof constraints, which can't be codified in JSON, are honored
 * @param typename The name of the proto type for error messages
 * @param obj The proto object that should have a "oneof" constraint
 * @param oneof The name of the field that should be a "oneof" for error messages
 * @param fields The fields that are defiend as a oneof in the proto definition
 */
function assertOneOf(typename, obj, oneof, ...fields) {
    const defined = [];
    for (const key of fields) {
        const value = obj[key];
        if (typeof value !== "undefined" && value != null) {
            defined.push(key);
        }
    }
    if (defined.length > 1) {
        throw new error_1.FirebaseError(`Invalid ${typename} definition. ${oneof} can only have one field defined, but found ${defined.join(",")}`);
    }
}
exports.assertOneOf = assertOneOf;
/**
 * Utility function to help copy fields from type A to B.
 * As a safety net, catches typos or fields that aren't named the same
 * in A and B, but cannot verify that both Src and Dest have the same type for the same field.
 */
function copyIfPresent(dest, src, ...fields) {
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(src, field)) {
            continue;
        }
        dest[field] = src[field];
    }
}
exports.copyIfPresent = copyIfPresent;
/** Overload */
function convertIfPresent(...args) {
    if (args.length === 4) {
        const [dest, src, key, converter] = args;
        if (Object.prototype.hasOwnProperty.call(src, key)) {
            dest[key] = converter(src[key]);
        }
        return;
    }
    const [dest, src, destKey, srcKey, converter] = args;
    if (Object.prototype.hasOwnProperty.call(src, srcKey)) {
        dest[destKey] = converter(src[srcKey]);
    }
}
exports.convertIfPresent = convertIfPresent;
/** Moves a field from one key in source to another key in dest */
function renameIfPresent(dest, src, destKey, srcKey) {
    if (!Object.prototype.hasOwnProperty.call(src, srcKey)) {
        return;
    }
    dest[destKey] = src[srcKey];
}
exports.renameIfPresent = renameIfPresent;
/**
 * Calculate a field mask of all values set in object.
 * If the proto definition has a map<string, string>, keys will be user-defined
 * and should not be recursed. Specify this by adding a field mask prefix for doNotRecurseIn.
 * @param object The proto JSON object. If a field should be explicitly deleted, it should be
 *               set to `undefined`. This allows field masks to pick it up but JSON.stringify
 *               to drop it.
 * @param doNotRecurseIn the dot-delimited address of fields which, if present, are proto map
 *                       types and their keys are not part of the field mask.
 */
function fieldMasks(object, ...doNotRecurseIn) {
    const masks = [];
    fieldMasksHelper([], object, doNotRecurseIn, masks);
    return masks;
}
exports.fieldMasks = fieldMasks;
function fieldMasksHelper(prefixes, cursor, doNotRecurseIn, masks) {
    // Empty arrays should never be sent because they're dropped by the one platform
    // gateway and then services get confused why there's an update mask for a missing field"
    if (Array.isArray(cursor) && !cursor.length) {
        return;
    }
    if (typeof cursor !== "object" || (Array.isArray(cursor) && cursor.length) || cursor === null) {
        masks.push(prefixes.join("."));
        return;
    }
    const entries = Object.entries(cursor);
    // An empty object (e.g. CloudFunction.httpsTrigger) is an explicit object.
    // This is needed for protobuf.Empty
    if (entries.length === 0) {
        masks.push(prefixes.join("."));
        return;
    }
    for (const [key, value] of entries) {
        const newPrefixes = [...prefixes, key];
        if (doNotRecurseIn.includes(newPrefixes.join("."))) {
            masks.push(newPrefixes.join("."));
            continue;
        }
        fieldMasksHelper(newPrefixes, value, doNotRecurseIn, masks);
    }
}
/**
 * Gets the correctly invoker members to be used with the invoker role for IAM API calls.
 * @param invoker the array of non-formatted invoker members
 * @param projectId the ID of the current project
 * @return an array of correctly formatted invoker members
 * @throws {@link FirebaseError} if any invoker string is empty or not of the correct form
 */
function getInvokerMembers(invoker, projectId) {
    if (invoker.includes("private")) {
        return [];
    }
    if (invoker.includes("public")) {
        return ["allUsers"];
    }
    return invoker.map((inv) => formatServiceAccount(inv, projectId));
}
exports.getInvokerMembers = getInvokerMembers;
/**
 * Formats the service account to be used with IAM API calls, a vaild service account string is
 * '{service-account}@' or '{service-account}@{project}.iam.gserviceaccount.com'.
 * @param serviceAccount the custom service account created by the user
 * @param projectId the ID of the current project
 * @param removeTypePrefix remove type prefix in the formatted service account
 * @return a correctly formatted service account string
 * @throws {@link FirebaseError} if the supplied service account string is empty or not of the correct form
 */
function formatServiceAccount(serviceAccount, projectId, removeTypePrefix = false) {
    if (serviceAccount.length === 0) {
        throw new error_1.FirebaseError("Service account cannot be an empty string");
    }
    if (!serviceAccount.includes("@")) {
        throw new error_1.FirebaseError("Service account must be of the form 'service-account@' or 'service-account@{project-id}.iam.gserviceaccount.com'");
    }
    const prefix = removeTypePrefix ? "" : "serviceAccount:";
    if (serviceAccount.endsWith("@")) {
        const suffix = `${projectId}.iam.gserviceaccount.com`;
        return `${prefix}${serviceAccount}${suffix}`;
    }
    return `${prefix}${serviceAccount}`;
}
exports.formatServiceAccount = formatServiceAccount;
/**
 * Remove keys whose values are undefined.
 * When we write an interface { foo?: number } there are three possible
 * forms: { foo: 1 }, {}, and { foo: undefined }. The latter surprises
 * most people and make unit test comparison flaky. This cleans that up.
 */
function pruneUndefiends(obj) {
    if (typeof obj !== "object" || obj === null) {
        return;
    }
    const keyable = obj;
    for (const key of Object.keys(keyable)) {
        if (keyable[key] === undefined) {
            delete keyable[key];
        }
        else if (typeof keyable[key] === "object") {
            if (Array.isArray(keyable[key])) {
                for (const sub of keyable[key]) {
                    pruneUndefiends(sub);
                }
                keyable[key] = keyable[key].filter((e) => e !== undefined);
            }
            else {
                pruneUndefiends(keyable[key]);
            }
        }
    }
}
exports.pruneUndefiends = pruneUndefiends;
//# sourceMappingURL=proto.js.map