"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labels = exports.ensureApi = exports.isAppHostingManaged = exports.isFunctionsManaged = exports.FIREBASE_MANAGED = exports.checkServiceAgentRole = exports.ensureServiceAgentRole = exports.setIamPolicy = exports.getIamPolicy = exports.addVersion = exports.deleteSecret = exports.patchSecret = exports.createSecret = exports.toSecretVersionResourceName = exports.parseSecretVersionResourceName = exports.parseSecretResourceName = exports.secretExists = exports.destroySecretVersion = exports.accessSecretVersion = exports.getSecretVersion = exports.listSecretVersions = exports.getSecretMetadata = exports.listSecrets = exports.getSecret = exports.secretManagerConsoleUri = void 0;
const utils_1 = require("../utils");
const error_1 = require("../error");
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const ensureApiEnabled = __importStar(require("../ensureApiEnabled"));
const projectUtils_1 = require("../projectUtils");
// Matches projects/{PROJECT}/secrets/{SECRET}
const SECRET_NAME_REGEX = new RegExp("projects\\/" +
    "(?<project>(?:\\d+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/" +
    "secrets\\/" +
    "(?<secret>[A-Za-z\\d\\-_]+)");
// Matches projects/{PROJECT}/secrets/{SECRET}/versions/{latest|VERSION}
const SECRET_VERSION_NAME_REGEX = new RegExp(SECRET_NAME_REGEX.source + "\\/versions\\/" + "(?<version>latest|[0-9]+)");
const secretManagerConsoleUri = (projectId) => `https://console.cloud.google.com/security/secret-manager?project=${projectId}`;
exports.secretManagerConsoleUri = secretManagerConsoleUri;
const API_VERSION = "v1";
const client = new apiv2_1.Client({ urlPrefix: (0, api_1.secretManagerOrigin)(), apiVersion: API_VERSION });
/**
 * Returns secret resource of given name in the project.
 */
async function getSecret(projectId, name) {
    const getRes = await client.get(`projects/${projectId}/secrets/${name}`);
    const secret = parseSecretResourceName(getRes.body.name);
    secret.labels = getRes.body.labels ?? {};
    secret.replication = getRes.body.replication ?? {};
    return secret;
}
exports.getSecret = getSecret;
/**
 * Lists all secret resources associated with a project.
 */
async function listSecrets(projectId, filter) {
    const secrets = [];
    const path = `projects/${projectId}/secrets`;
    const baseOpts = filter ? { queryParams: { filter } } : {};
    let pageToken = "";
    while (true) {
        const opts = pageToken === ""
            ? baseOpts
            : { ...baseOpts, queryParams: { ...baseOpts?.queryParams, pageToken } };
        const res = await client.get(path, opts);
        for (const s of res.body.secrets || []) {
            secrets.push({
                ...parseSecretResourceName(s.name),
                labels: s.labels ?? {},
                replication: s.replication ?? {},
            });
        }
        if (!res.body.nextPageToken) {
            break;
        }
        pageToken = res.body.nextPageToken;
    }
    return secrets;
}
exports.listSecrets = listSecrets;
/**
 * Retrieves a specific Secret and SecretVersion from CSM, if available.
 */
async function getSecretMetadata(projectId, secretName, version) {
    const secretInfo = {};
    try {
        secretInfo.secret = await getSecret(projectId, secretName);
        secretInfo.secretVersion = await getSecretVersion(projectId, secretName, version);
    }
    catch (err) {
        // Throw anything other than the expected 404 errors.
        if (err.status !== 404) {
            throw err;
        }
    }
    return secretInfo;
}
exports.getSecretMetadata = getSecretMetadata;
/**
 * List all secret versions associated with a secret.
 */
async function listSecretVersions(projectId, name, filter) {
    const secrets = [];
    const path = `projects/${projectId}/secrets/${name}/versions`;
    const baseOpts = filter ? { queryParams: { filter } } : {};
    let pageToken = "";
    while (true) {
        const opts = pageToken === ""
            ? baseOpts
            : { ...baseOpts, queryParams: { ...baseOpts?.queryParams, pageToken } };
        const res = await client.get(path, opts);
        for (const s of res.body.versions || []) {
            secrets.push({
                ...parseSecretVersionResourceName(s.name),
                state: s.state,
                createTime: s.createTime,
            });
        }
        if (!res.body.nextPageToken) {
            break;
        }
        pageToken = res.body.nextPageToken;
    }
    return secrets;
}
exports.listSecretVersions = listSecretVersions;
/**
 * Returns secret version resource of given name and version in the project.
 */
async function getSecretVersion(projectId, name, version) {
    const getRes = await client.get(`projects/${projectId}/secrets/${name}/versions/${version}`);
    return {
        ...parseSecretVersionResourceName(getRes.body.name),
        state: getRes.body.state,
        createTime: getRes.body.createTime,
    };
}
exports.getSecretVersion = getSecretVersion;
/**
 * Access secret value of a given secret version.
 */
async function accessSecretVersion(projectId, name, version) {
    const res = await client.get(`projects/${projectId}/secrets/${name}/versions/${version}:access`);
    return Buffer.from(res.body.payload.data, "base64").toString();
}
exports.accessSecretVersion = accessSecretVersion;
/**
 * Change state of secret version to destroyed.
 */
async function destroySecretVersion(projectId, name, version) {
    if (version === "latest") {
        const sv = await getSecretVersion(projectId, name, "latest");
        version = sv.versionId;
    }
    await client.post(`projects/${projectId}/secrets/${name}/versions/${version}:destroy`);
}
exports.destroySecretVersion = destroySecretVersion;
/**
 * Returns true if secret resource of given name exists on the project.
 */
async function secretExists(projectId, name) {
    try {
        await getSecret(projectId, name);
        return true;
    }
    catch (err) {
        if (err.status === 404) {
            return false;
        }
        throw err;
    }
}
exports.secretExists = secretExists;
/**
 * Parse full secret resource name.
 */
function parseSecretResourceName(resourceName) {
    const match = SECRET_NAME_REGEX.exec(resourceName);
    if (!match?.groups) {
        throw new error_1.FirebaseError(`Invalid secret resource name [${resourceName}].`);
    }
    return {
        projectId: match.groups.project,
        name: match.groups.secret,
        labels: {},
        replication: {},
    };
}
exports.parseSecretResourceName = parseSecretResourceName;
/**
 * Parse full secret version resource name.
 */
function parseSecretVersionResourceName(resourceName) {
    const match = resourceName.match(SECRET_VERSION_NAME_REGEX);
    if (!match?.groups) {
        throw new error_1.FirebaseError(`Invalid secret version resource name [${resourceName}].`);
    }
    return {
        secret: {
            projectId: match.groups.project,
            name: match.groups.secret,
            labels: {},
            replication: {},
        },
        versionId: match.groups.version,
        createTime: "",
    };
}
exports.parseSecretVersionResourceName = parseSecretVersionResourceName;
/**
 * Returns full secret version resource name.
 */
function toSecretVersionResourceName(secretVersion) {
    return `projects/${secretVersion.secret.projectId}/secrets/${secretVersion.secret.name}/versions/${secretVersion.versionId}`;
}
exports.toSecretVersionResourceName = toSecretVersionResourceName;
/**
 * Creates a new secret resource.
 */
async function createSecret(projectId, name, labels, location) {
    let replication;
    if (location) {
        replication = {
            userManaged: {
                replicas: [
                    {
                        location,
                    },
                ],
            },
        };
    }
    else {
        replication = { automatic: {} };
    }
    const createRes = await client.post(`projects/${projectId}/secrets`, {
        name,
        replication,
        labels,
    }, { queryParams: { secretId: name } });
    return {
        ...parseSecretResourceName(createRes.body.name),
        labels,
        replication,
    };
}
exports.createSecret = createSecret;
/**
 * Update metadata associated with a secret.
 */
async function patchSecret(projectId, name, labels) {
    const fullName = `projects/${projectId}/secrets/${name}`;
    const res = await client.patch(fullName, { name: fullName, labels }, { queryParams: { updateMask: "labels" } });
    return {
        ...parseSecretResourceName(res.body.name),
        labels: res.body.labels,
        replication: res.body.replication,
    };
}
exports.patchSecret = patchSecret;
/**
 * Delete secret resource.
 */
async function deleteSecret(projectId, name) {
    const path = `projects/${projectId}/secrets/${name}`;
    await client.delete(path);
}
exports.deleteSecret = deleteSecret;
/**
 * Add new version the payload as value on the given secret.
 */
async function addVersion(projectId, name, payloadData) {
    const res = await client.post(`projects/${projectId}/secrets/${name}:addVersion`, {
        payload: {
            data: Buffer.from(payloadData).toString("base64"),
        },
    });
    return {
        ...parseSecretVersionResourceName(res.body.name),
        state: res.body.state,
        createTime: "",
    };
}
exports.addVersion = addVersion;
/**
 * Returns IAM policy of a secret resource.
 */
async function getIamPolicy(secret) {
    const res = await client.get(`projects/${secret.projectId}/secrets/${secret.name}:getIamPolicy`);
    return res.body;
}
exports.getIamPolicy = getIamPolicy;
/**
 * Sets IAM policy on a secret resource.
 */
async function setIamPolicy(secret, bindings) {
    await client.post(`projects/${secret.projectId}/secrets/${secret.name}:setIamPolicy`, {
        policy: {
            bindings,
        },
        updateMask: "bindings",
    });
}
exports.setIamPolicy = setIamPolicy;
/**
 * Ensure that given service agents have the given IAM role on the secret resource.
 */
async function ensureServiceAgentRole(secret, serviceAccountEmails, role) {
    const bindings = await checkServiceAgentRole(secret, serviceAccountEmails, role);
    if (bindings.length) {
        await module.exports.setIamPolicy(secret, bindings);
    }
    // SecretManager would like us to _always_ inform users when we grant access to one of their secrets.
    // As a safeguard against forgetting to do so, we log it here.
    (0, utils_1.logLabeledSuccess)("secretmanager", `Granted ${role} on projects/${secret.projectId}/secrets/${secret.name} to ${serviceAccountEmails.join(", ")}`);
}
exports.ensureServiceAgentRole = ensureServiceAgentRole;
async function checkServiceAgentRole(secret, serviceAccountEmails, role) {
    const policy = await module.exports.getIamPolicy(secret);
    const bindings = policy.bindings || [];
    let binding = bindings.find((b) => b.role === role);
    if (!binding) {
        binding = { role, members: [] };
        bindings.push(binding);
    }
    let shouldShortCircuit = true;
    for (const serviceAccount of serviceAccountEmails) {
        if (!binding.members.find((m) => m === `serviceAccount:${serviceAccount}`)) {
            binding.members.push(`serviceAccount:${serviceAccount}`);
            shouldShortCircuit = false;
        }
    }
    if (shouldShortCircuit)
        return [];
    return bindings;
}
exports.checkServiceAgentRole = checkServiceAgentRole;
exports.FIREBASE_MANAGED = "firebase-managed";
/**
 * Returns true if secret is managed by Cloud Functions for Firebase.
 * This used to be firebase-managed: true, but was later changed to firebase-managed: functions to
 * improve readability.
 */
function isFunctionsManaged(secret) {
    return (secret.labels[exports.FIREBASE_MANAGED] === "true" || secret.labels[exports.FIREBASE_MANAGED] === "functions");
}
exports.isFunctionsManaged = isFunctionsManaged;
/**
 * Returns true if secret is managed by Firebase App Hosting.
 */
function isAppHostingManaged(secret) {
    return secret.labels[exports.FIREBASE_MANAGED] === "apphosting";
}
exports.isAppHostingManaged = isAppHostingManaged;
/**
 * Utility used in the "before" command annotation to enable the API.
 */
function ensureApi(options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    return ensureApiEnabled.ensure(projectId, (0, api_1.secretManagerOrigin)(), "secretmanager", true);
}
exports.ensureApi = ensureApi;
/**
 * Return labels to mark secret as managed by Firebase.
 * @internal
 */
function labels(product = "functions") {
    return { [exports.FIREBASE_MANAGED]: product };
}
exports.labels = labels;
//# sourceMappingURL=secretManager.js.map