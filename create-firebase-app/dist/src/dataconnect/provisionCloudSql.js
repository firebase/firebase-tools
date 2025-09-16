"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUpdateReason = exports.cloudSQLBeingCreated = exports.setupCloudSql = void 0;
const cloudSqlAdminClient = require("../gcp/cloudsql/cloudsqladmin");
const utils = require("../utils");
const checkIam_1 = require("./checkIam");
const utils_1 = require("../utils");
const logger_1 = require("../logger");
const freeTrial_1 = require("./freeTrial");
const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";
/** Sets up a Cloud SQL instance, database and its permissions. */
async function setupCloudSql(args) {
    await upsertInstance(Object.assign({}, args));
    const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;
    if (requireGoogleMlIntegration && !dryRun) {
        await (0, checkIam_1.grantRolesToCloudSqlServiceAccount)(projectId, instanceId, [GOOGLE_ML_INTEGRATION_ROLE]);
    }
}
exports.setupCloudSql = setupCloudSql;
async function upsertInstance(args) {
    const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;
    try {
        const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
        utils.logLabeledBullet("dataconnect", `Found existing Cloud SQL instance ${instanceId}.`);
        const why = getUpdateReason(existingInstance, requireGoogleMlIntegration);
        if (why) {
            if (dryRun) {
                utils.logLabeledBullet("dataconnect", `Cloud SQL instance ${instanceId} settings not compatible with Firebase Data Connect. ` +
                    `It will be updated on your next deploy.` +
                    why);
            }
            else {
                utils.logLabeledBullet("dataconnect", `Cloud SQL instance ${instanceId} settings not compatible with Firebase Data Connect. ` +
                    why);
                await (0, utils_1.promiseWithSpinner)(() => cloudSqlAdminClient.updateInstanceForDataConnect(existingInstance, requireGoogleMlIntegration), "Updating your Cloud SQL instance...");
            }
        }
        await upsertDatabase(Object.assign({}, args));
    }
    catch (err) {
        if (err.status !== 404) {
            throw err;
        }
        // Cloud SQL instance is not found, start its creation.
        await createInstance(Object.assign({}, args));
    }
}
async function createInstance(args) {
    const { projectId, location, instanceId, requireGoogleMlIntegration, dryRun } = args;
    const freeTrialUsed = await (0, freeTrial_1.checkFreeTrialInstanceUsed)(projectId);
    if (dryRun) {
        utils.logLabeledBullet("dataconnect", `Cloud SQL Instance ${instanceId} not found. It will be created on your next deploy.`);
    }
    else {
        await cloudSqlAdminClient.createInstance({
            projectId,
            location,
            instanceId,
            enableGoogleMlIntegration: requireGoogleMlIntegration,
            freeTrial: !freeTrialUsed,
        });
        utils.logLabeledBullet("dataconnect", cloudSQLBeingCreated(projectId, instanceId, !freeTrialUsed));
    }
}
/**
 * Returns a message indicating that a Cloud SQL instance is being created.
 */
function cloudSQLBeingCreated(projectId, instanceId, includeFreeTrialToS) {
    return (`Cloud SQL Instance ${instanceId} is being created.` +
        (includeFreeTrialToS
            ? `\nThis instance is provided under the terms of the Data Connect no-cost trial ${(0, freeTrial_1.freeTrialTermsLink)()}`
            : "") +
        `
   Meanwhile, your data are saved in a temporary database and will be migrated once complete. Monitor its progress at

   ${cloudSqlAdminClient.instanceConsoleLink(projectId, instanceId)}
`);
}
exports.cloudSQLBeingCreated = cloudSQLBeingCreated;
async function upsertDatabase(args) {
    const { projectId, instanceId, databaseId, dryRun } = args;
    try {
        await cloudSqlAdminClient.getDatabase(projectId, instanceId, databaseId);
        utils.logLabeledBullet("dataconnect", `Found existing Postgres Database ${databaseId}.`);
    }
    catch (err) {
        if (err.status !== 404) {
            // Skip it if the database is not accessible.
            // Possible that the CSQL instance is in the middle of something.
            logger_1.logger.debug(`Unexpected error from Cloud SQL: ${err}`);
            utils.logLabeledWarning("dataconnect", `Postgres Database ${databaseId} is not accessible.`);
            return;
        }
        if (dryRun) {
            utils.logLabeledBullet("dataconnect", `Postgres Database ${databaseId} not found. It will be created on your next deploy.`);
        }
        else {
            await cloudSqlAdminClient.createDatabase(projectId, instanceId, databaseId);
            utils.logLabeledBullet("dataconnect", `Postgres Database ${databaseId} created.`);
        }
    }
}
/**
 * Validate that existing Cloud SQL instances have the necessary settings.
 */
function getUpdateReason(instance, requireGoogleMlIntegration) {
    var _a, _b, _c, _d;
    let reason = "";
    const settings = instance.settings;
    // Cloud SQL instances must have public IP enabled to be used with Firebase Data Connect.
    if (!((_a = settings.ipConfiguration) === null || _a === void 0 ? void 0 : _a.ipv4Enabled)) {
        reason += "\n - to enable public IP.";
    }
    if (requireGoogleMlIntegration) {
        if (!settings.enableGoogleMlIntegration) {
            reason += "\n - to enable Google ML integration.";
        }
        if (!((_b = settings.databaseFlags) === null || _b === void 0 ? void 0 : _b.some((f) => f.name === "cloudsql.enable_google_ml_integration" && f.value === "on"))) {
            reason += "\n - to enable Google ML integration database flag.";
        }
    }
    // Cloud SQL instances must have IAM authentication enabled to be used with Firebase Data Connect.
    const isIamEnabled = (_d = (_c = settings.databaseFlags) === null || _c === void 0 ? void 0 : _c.some((f) => f.name === "cloudsql.iam_authentication" && f.value === "on")) !== null && _d !== void 0 ? _d : false;
    if (!isIamEnabled) {
        reason += "\n - to enable IAM authentication database flag.";
    }
    return reason;
}
exports.getUpdateReason = getUpdateReason;
