"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermissions = void 0;
const colorette_1 = require("colorette");
const projectUtils_1 = require("./projectUtils");
const requireAuth_1 = require("./requireAuth");
const logger_1 = require("./logger");
const error_1 = require("./error");
const iam_1 = require("./gcp/iam");
// Permissions required for all commands.
const BASE_PERMISSIONS = ["firebase.projects.get"];
/**
 * Before filter that verifies authentication and performs informational IAM permissions check.
 *
 * @param options The command-wide options object.
 * @param permissions A list of IAM permissions to require.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requirePermissions(options, permissions = []) {
    const projectId = (0, projectUtils_1.getProjectId)(options);
    if (!projectId) {
        return;
    }
    const requiredPermissions = BASE_PERMISSIONS.concat(permissions).sort();
    await (0, requireAuth_1.requireAuth)(options);
    logger_1.logger.debug(`[iam] checking project ${projectId} for permissions ${JSON.stringify(requiredPermissions)}`);
    try {
        const iamResult = await (0, iam_1.testIamPermissions)(projectId, requiredPermissions);
        if (!iamResult.passed) {
            throw new error_1.FirebaseError(`Authorization failed. This account is missing the following required permissions on project ${(0, colorette_1.bold)(projectId)}:\n\n  ${iamResult.missing.join("\n  ")}`);
        }
    }
    catch (err) {
        logger_1.logger.debug(`[iam] error while checking permissions, command may fail: ${(0, error_1.getErrMsg)(err)}`);
        return;
    }
}
exports.requirePermissions = requirePermissions;
//# sourceMappingURL=requirePermissions.js.map