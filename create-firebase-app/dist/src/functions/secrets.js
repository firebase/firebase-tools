"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeSecret = exports.updateEndpointSecret = exports.pruneAndDestroySecrets = exports.pruneSecrets = exports.versionInUse = exports.inUse = exports.getSecretVersions = exports.of = exports.ensureSecret = exports.ensureValidKey = void 0;
const utils = require("../utils");
const poller = require("../operation-poller");
const gcfV1 = require("../gcp/cloudfunctions");
const gcfV2 = require("../gcp/cloudfunctionsv2");
const api_1 = require("../api");
const secretManager_1 = require("../gcp/secretManager");
const error_1 = require("../error");
const utils_1 = require("../utils");
const prompt_1 = require("../prompt");
const env_1 = require("./env");
const logger_1 = require("../logger");
const functional_1 = require("../functional");
const secretManager_2 = require("../gcp/secretManager");
const secretManager_3 = require("../gcp/secretManager");
const projectUtils_1 = require("../projectUtils");
const Table = require("cli-table3");
// For mysterious reasons, importing the poller option in fabricator.ts leads to some
// value of the poller option to be undefined at runtime. I can't figure out what's going on,
// but don't have time to find out. Taking a shortcut and copying the values directly in
// violation of DRY. Sorry!
const gcfV1PollerOptions = {
    apiOrigin: (0, api_1.functionsOrigin)(),
    apiVersion: "v1",
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
const gcfV2PollerOptions = {
    apiOrigin: (0, api_1.functionsV2Origin)(),
    apiVersion: "v2",
    masterTimeout: 25 * 60 * 1000,
    maxBackoff: 10000,
};
function toUpperSnakeCase(key) {
    return key
        .replace(/[.-]/g, "_")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toUpperCase();
}
/**
 * Validate and transform keys to match the convention recommended by Firebase.
 */
async function ensureValidKey(key, options) {
    const transformedKey = toUpperSnakeCase(key);
    if (transformedKey !== key) {
        if (options.force) {
            throw new error_1.FirebaseError("Secret key must be in UPPER_SNAKE_CASE.");
        }
        (0, utils_1.logWarning)(`By convention, secret key must be in UPPER_SNAKE_CASE.`);
        const useTransformed = await (0, prompt_1.confirm)({
            default: true,
            message: `Would you like to use ${transformedKey} as key instead?`,
            nonInteractive: options.nonInteractive,
            force: options.force,
        });
        if (!useTransformed) {
            throw new error_1.FirebaseError("Secret key must be in UPPER_SNAKE_CASE.");
        }
    }
    try {
        (0, env_1.validateKey)(transformedKey);
    }
    catch (err) {
        throw new error_1.FirebaseError(`Invalid secret key ${transformedKey}`, { children: [err] });
    }
    return transformedKey;
}
exports.ensureValidKey = ensureValidKey;
/**
 * Ensure secret exists. Optionally prompt user to have non-Firebase managed keys be managed by Firebase.
 */
async function ensureSecret(projectId, name, options) {
    try {
        const secret = await (0, secretManager_1.getSecret)(projectId, name);
        if ((0, secretManager_1.isAppHostingManaged)(secret)) {
            (0, utils_1.logWarning)("Your secret is managed by Firebase App Hosting. Continuing will disable automatic deletion of old versions.");
            const stopTracking = await (0, prompt_1.confirm)({
                message: "Do you wish to continue?",
                nonInteractive: options.nonInteractive,
                force: options.force,
            });
            if (stopTracking) {
                delete secret.labels[secretManager_2.FIREBASE_MANAGED];
                await (0, secretManager_1.patchSecret)(secret.projectId, secret.name, secret.labels);
            }
            else {
                throw new Error("A secret cannot be managed by both Firebase App Hosting and Cloud Functions for Firebase");
            }
        }
        else if (!(0, secretManager_2.isFunctionsManaged)(secret)) {
            if (!options.force) {
                (0, utils_1.logWarning)("Your secret is not managed by Cloud Functions for Firebase. " +
                    "Firebase managed secrets are automatically pruned to reduce your monthly cost for using Secret Manager. ");
                const updateLabels = await (0, prompt_1.confirm)({
                    default: true,
                    message: `Would you like to have your secret ${secret.name} managed by Cloud Functions for Firebase?`,
                    nonInteractive: options.nonInteractive,
                    force: options.force,
                });
                if (updateLabels) {
                    return (0, secretManager_1.patchSecret)(projectId, secret.name, Object.assign(Object.assign({}, secret.labels), (0, secretManager_3.labels)()));
                }
            }
        }
        return secret;
    }
    catch (err) {
        if (err.status !== 404) {
            throw err;
        }
    }
    return await (0, secretManager_1.createSecret)(projectId, name, (0, secretManager_3.labels)());
}
exports.ensureSecret = ensureSecret;
/**
 * Collects all secret environment variables of endpoints.
 */
function of(endpoints) {
    return endpoints.reduce((envs, endpoint) => [...envs, ...(endpoint.secretEnvironmentVariables || [])], []);
}
exports.of = of;
/**
 * Generates an object mapping secret's with their versions.
 */
function getSecretVersions(endpoint) {
    return (endpoint.secretEnvironmentVariables || []).reduce((memo, { secret, version }) => {
        memo[secret] = version || "";
        return memo;
    }, {});
}
exports.getSecretVersions = getSecretVersions;
/**
 * Checks whether a secret is in use by the given endpoint.
 */
function inUse(projectInfo, secret, endpoint) {
    const { projectId, projectNumber } = projectInfo;
    for (const sev of of([endpoint])) {
        if ((sev.projectId === projectId || sev.projectId === projectNumber) &&
            sev.secret === secret.name) {
            return true;
        }
    }
    return false;
}
exports.inUse = inUse;
/**
 * Checks whether a secret version in use by the given endpoint.
 */
function versionInUse(projectInfo, sv, endpoint) {
    const { projectId, projectNumber } = projectInfo;
    for (const sev of of([endpoint])) {
        if ((sev.projectId === projectId || sev.projectId === projectNumber) &&
            sev.secret === sv.secret.name &&
            sev.version === sv.versionId) {
            return true;
        }
    }
    return false;
}
exports.versionInUse = versionInUse;
/**
 * Returns all secret versions from Firebase managed secrets unused in the given list of endpoints.
 */
async function pruneSecrets(projectInfo, endpoints) {
    const { projectId, projectNumber } = projectInfo;
    const pruneKey = (name, version) => `${name}@${version}`;
    const prunedSecrets = new Set();
    // Collect all Firebase managed secret versions
    const haveSecrets = await (0, secretManager_1.listSecrets)(projectId, `labels.${secretManager_2.FIREBASE_MANAGED}=true`);
    for (const secret of haveSecrets) {
        const versions = await (0, secretManager_1.listSecretVersions)(projectId, secret.name, `NOT state: DESTROYED`);
        for (const version of versions) {
            prunedSecrets.add(pruneKey(secret.name, version.versionId));
        }
    }
    // Prune all project-scoped secrets in use.
    const secrets = [];
    for (const secret of of(endpoints)) {
        if (!secret.version) {
            // All bets are off if secret version isn't available in the endpoint definition.
            // This should never happen for GCFv1 instances.
            throw new error_1.FirebaseError(`Secret ${secret.secret} version is unexpectedly empty.`);
        }
        if (secret.projectId === projectId || secret.projectId === projectNumber) {
            // We already know that secret.version isn't empty, but TS can't figure it out for some reason.
            if (secret.version) {
                secrets.push(Object.assign(Object.assign({}, secret), { version: secret.version }));
            }
        }
    }
    for (const sev of secrets) {
        let name = sev.secret;
        if (name.includes("/")) {
            const secret = (0, secretManager_1.parseSecretResourceName)(name);
            name = secret.name;
        }
        let version = sev.version;
        if (version === "latest") {
            // We need to figure out what "latest" resolves to.
            const resolved = await (0, secretManager_1.getSecretVersion)(projectId, name, version);
            version = resolved.versionId;
        }
        prunedSecrets.delete(pruneKey(name, version));
    }
    return Array.from(prunedSecrets)
        .map((key) => key.split("@"))
        .map(([secret, version]) => ({ projectId, version, secret, key: secret }));
}
exports.pruneSecrets = pruneSecrets;
/**
 * Prune and destroy all unused secret versions. Only Firebase managed secrets will be scanned.
 */
async function pruneAndDestroySecrets(projectInfo, endpoints) {
    const { projectId, projectNumber } = projectInfo;
    logger_1.logger.debug("Pruning secrets to find unused secret versions...");
    const unusedSecrets = await module.exports.pruneSecrets({ projectId, projectNumber }, endpoints);
    if (unusedSecrets.length === 0) {
        return { destroyed: [], erred: [] };
    }
    const destroyed = [];
    const erred = [];
    const msg = unusedSecrets.map((s) => `${s.secret}@${s.version}`);
    logger_1.logger.debug(`Found unused secret versions: ${msg}. Destroying them...`);
    const destroyResults = await utils.allSettled(unusedSecrets.map(async (sev) => {
        await (0, secretManager_1.destroySecretVersion)(sev.projectId, sev.secret, sev.version);
        return sev;
    }));
    for (const result of destroyResults) {
        if (result.status === "fulfilled") {
            destroyed.push(result.value);
        }
        else {
            erred.push(result.reason);
        }
    }
    return { destroyed, erred };
}
exports.pruneAndDestroySecrets = pruneAndDestroySecrets;
/**
 * Updates given endpoint to use the given secret version.
 */
async function updateEndpointSecret(projectInfo, secretVersion, endpoint) {
    const { projectId, projectNumber } = projectInfo;
    if (!inUse(projectInfo, secretVersion.secret, endpoint)) {
        return endpoint;
    }
    const updatedSevs = [];
    for (const sev of of([endpoint])) {
        const updatedSev = Object.assign({}, sev);
        if ((updatedSev.projectId === projectId || updatedSev.projectId === projectNumber) &&
            updatedSev.secret === secretVersion.secret.name) {
            updatedSev.version = secretVersion.versionId;
        }
        updatedSevs.push(updatedSev);
    }
    if (endpoint.platform === "gcfv1") {
        const fn = gcfV1.functionFromEndpoint(endpoint, "");
        const op = await gcfV1.updateFunction({
            name: fn.name,
            runtime: fn.runtime,
            entryPoint: fn.entryPoint,
            secretEnvironmentVariables: updatedSevs,
        });
        const cfn = await poller.pollOperation(Object.assign(Object.assign({}, gcfV1PollerOptions), { operationResourceName: op.name }));
        return gcfV1.endpointFromFunction(cfn);
    }
    else if (endpoint.platform === "gcfv2") {
        const fn = gcfV2.functionFromEndpoint(endpoint);
        const op = await gcfV2.updateFunction(Object.assign(Object.assign({}, fn), { serviceConfig: Object.assign(Object.assign({}, fn.serviceConfig), { secretEnvironmentVariables: updatedSevs }) }));
        const cfn = await poller.pollOperation(Object.assign(Object.assign({}, gcfV2PollerOptions), { operationResourceName: op.name }));
        return gcfV2.endpointFromFunction(cfn);
    }
    else if (endpoint.platform === "run") {
        // This may be tricky because the image has been deleted. How does this work
        // with GCF?
        throw new error_1.FirebaseError("Updating Cloud Run functions is not yet implemented.");
    }
    else {
        (0, functional_1.assertExhaustive)(endpoint.platform);
    }
}
exports.updateEndpointSecret = updateEndpointSecret;
/**
 * Describe the given secret.
 */
async function describeSecret(key, options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const versions = await (0, secretManager_1.listSecretVersions)(projectId, key);
    const table = new Table({
        head: ["Version", "State"],
        style: { head: ["yellow"] },
    });
    for (const version of versions) {
        table.push([version.versionId, version.state]);
    }
    logger_1.logger.info(table.toString());
    return { secrets: versions };
}
exports.describeSecret = describeSecret;
