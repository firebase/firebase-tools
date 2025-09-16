"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureProjectConfigured = void 0;
const resourceManager_1 = require("../gcp/resourceManager");
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const api_1 = require("../api");
const utils_1 = require("../utils");
const error_1 = require("../error");
const iam = require("../gcp/iam");
const prompt_1 = require("../prompt");
const TEST_RUNNER_ROLE = "roles/firebaseapptesting.testRunner";
const TEST_RUNNER_SERVICE_ACCOUNT_NAME = "firebaseapptesting-test-runner";
async function ensureProjectConfigured(projectId) {
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.appTestingOrigin)(), "Firebase App Testing", false);
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.cloudRunApiOrigin)(), "Cloud Run", false);
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.storageOrigin)(), "Cloud Storage", false);
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.artifactRegistryDomain)(), "Artifact Registry", false);
    const serviceAccount = runnerServiceAccount(projectId);
    const serviceAccountExistsAndIsRunner = await (0, resourceManager_1.serviceAccountHasRoles)(projectId, serviceAccount, [TEST_RUNNER_ROLE], true);
    if (!serviceAccountExistsAndIsRunner) {
        const grant = await (0, prompt_1.confirm)(`Firebase App Testing runs tests in Cloud Run using a service account, provision an account, "${serviceAccount}", with the role "${TEST_RUNNER_ROLE}"?`);
        if (!grant) {
            (0, utils_1.logBullet)("You, or your project administrator, should run the following command to grant the required role:\n\n" +
                `\tgcloud projects add-iam-policy-binding ${projectId} \\\n` +
                `\t  --member="serviceAccount:${serviceAccount}" \\\n` +
                `\t  --role="${TEST_RUNNER_ROLE}"\n`);
            throw new error_1.FirebaseError(`Firebase App Testing requires a service account named "${serviceAccount}" with the "${TEST_RUNNER_ROLE}" role to execute tests using Cloud Run`);
        }
        await provisionServiceAccount(projectId, serviceAccount);
    }
}
exports.ensureProjectConfigured = ensureProjectConfigured;
async function provisionServiceAccount(projectId, serviceAccount) {
    try {
        await iam.createServiceAccount(projectId, TEST_RUNNER_SERVICE_ACCOUNT_NAME, "Service Account used in Cloud Run, responsible for running tests", "Firebase App Testing Test Runner");
    }
    catch (err) {
        // 409 Already Exists errors can safely be ignored.
        if ((0, error_1.getErrStatus)(err) !== 409) {
            throw err;
        }
    }
    try {
        await (0, resourceManager_1.addServiceAccountToRoles)(projectId, serviceAccount, [TEST_RUNNER_ROLE], 
        /* skipAccountLookup= */ true);
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 400) {
            (0, utils_1.logWarning)(`Your App Testing runner service account, "${serviceAccount}", is still being provisioned in the background. If you encounter an error, please try again after a few moments.`);
        }
        else {
            throw err;
        }
    }
}
function runnerServiceAccount(projectId) {
    return `${TEST_RUNNER_SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`;
}
