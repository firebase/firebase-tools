"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPermitted = exports.getAdminCredentialValidator = exports.getAdminOnlyFirebaseRulesValidator = exports.getFirebaseRulesValidator = void 0;
const emulatorLogger_1 = require("../../emulatorLogger");
const types_1 = require("../../types");
/**
 * Returns a validator that pulls a Ruleset from a {@link RulesetProvider} on each run.
 */
function getFirebaseRulesValidator(rulesetProvider) {
    return {
        validate: async (path, bucketId, method, variableOverrides, projectId, authorization, delimiter) => {
            return await isPermitted({
                ruleset: rulesetProvider(bucketId),
                file: variableOverrides,
                path,
                method,
                projectId,
                authorization,
                delimiter,
            });
        },
    };
}
exports.getFirebaseRulesValidator = getFirebaseRulesValidator;
/**
 * Returns a Firebase Rules validator returns true iff a valid OAuth (admin) credential
 * is available. This validator does *not* check Firebase Rules directly.
 */
function getAdminOnlyFirebaseRulesValidator() {
    return {
        /* eslint-disable @typescript-eslint/no-unused-vars */
        validate: (_path, _bucketId, _method, _variableOverrides, _authorization, delimiter) => {
            // TODO(tonyjhuang): This should check for valid admin credentials some day.
            // Unfortunately today, there's no easy way to set up the GCS SDK to pass
            // "Bearer owner" along with requests so this is a placeholder.
            return Promise.resolve(true);
        },
        /* eslint-enable @typescript-eslint/no-unused-vars */
    };
}
exports.getAdminOnlyFirebaseRulesValidator = getAdminOnlyFirebaseRulesValidator;
/**
 * Returns a validator for OAuth (admin) credentials. This typically takes the shape of
 * "Authorization: Bearer owner" headers.
 */
function getAdminCredentialValidator() {
    return { validate: isValidAdminCredentials };
}
exports.getAdminCredentialValidator = getAdminCredentialValidator;
/** Authorizes file access based on security rules. */
async function isPermitted(opts) {
    if (!opts.ruleset) {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE).log("WARN", `Can not process SDK request with no loaded ruleset`);
        return false;
    }
    // Skip auth for UI
    if (isValidAdminCredentials(opts.authorization)) {
        return true;
    }
    const { permitted, issues } = await opts.ruleset.verify({
        method: opts.method,
        path: opts.path,
        file: opts.file,
        projectId: opts.projectId,
        token: opts.authorization ? opts.authorization.split(" ")[1] : undefined,
        delimiter: opts.delimiter,
    });
    if (issues.exist()) {
        issues.all.forEach((warningOrError) => {
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE).log("WARN", warningOrError);
        });
    }
    return !!permitted;
}
exports.isPermitted = isPermitted;
function isValidAdminCredentials(authorization) {
    return ["Bearer owner", "Firebase owner"].includes(authorization !== null && authorization !== void 0 ? authorization : "");
}
