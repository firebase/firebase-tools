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
exports.listUsers = exports.deleteUser = exports.getUser = exports.createUser = exports.deleteDatabase = exports.createDatabase = exports.getDatabase = exports.listDatabases = exports.updateInstanceForDataConnect = exports.createInstance = exports.instanceConsoleLink = exports.getInstance = exports.listInstances = exports.iamUserIsCSQLAdmin = void 0;
const apiv2_1 = require("../../apiv2");
const api_1 = require("../../api");
const operationPoller = __importStar(require("../../operation-poller"));
const projectUtils_1 = require("../../projectUtils");
const logger_1 = require("../../logger");
const iam_1 = require("../iam");
const error_1 = require("../../error");
const API_VERSION = "v1";
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.cloudSQLAdminOrigin)(),
    auth: true,
    apiVersion: API_VERSION,
});
async function iamUserIsCSQLAdmin(options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const requiredPermissions = [
        "cloudsql.instances.connect",
        "cloudsql.instances.get",
        "cloudsql.users.create",
        "cloudsql.users.update",
    ];
    try {
        const iamResult = await (0, iam_1.testIamPermissions)(projectId, requiredPermissions);
        return iamResult.passed;
    }
    catch (err) {
        logger_1.logger.debug(`[iam] error while checking permissions, command may fail: ${err}`);
        return false;
    }
}
exports.iamUserIsCSQLAdmin = iamUserIsCSQLAdmin;
async function listInstances(projectId) {
    const res = await client.get(`projects/${projectId}/instances`);
    return res.body.items ?? [];
}
exports.listInstances = listInstances;
async function getInstance(projectId, instanceId) {
    const res = await client.get(`projects/${projectId}/instances/${instanceId}`);
    if (res.body.state === "FAILED") {
        throw new error_1.FirebaseError(`Cloud SQL instance ${instanceId} is in a failed state.\nGo to ${instanceConsoleLink(projectId, instanceId)} to repair or delete it.`);
    }
    return res.body;
}
exports.getInstance = getInstance;
/** Returns a link to Cloud SQL's page in Cloud Console. */
function instanceConsoleLink(projectId, instanceId) {
    return `https://console.cloud.google.com/sql/instances/${instanceId}/overview?project=${projectId}`;
}
exports.instanceConsoleLink = instanceConsoleLink;
async function createInstance(args) {
    const databaseFlags = [{ name: "cloudsql.iam_authentication", value: "on" }];
    if (args.enableGoogleMlIntegration) {
        databaseFlags.push({ name: "cloudsql.enable_google_ml_integration", value: "on" });
    }
    try {
        await client.post(`projects/${args.projectId}/instances`, {
            name: args.instanceId,
            region: args.location,
            databaseVersion: "POSTGRES_15",
            settings: {
                tier: "db-f1-micro",
                edition: "ENTERPRISE",
                ipConfiguration: {
                    authorizedNetworks: [],
                },
                enableGoogleMlIntegration: args.enableGoogleMlIntegration,
                databaseFlags,
                storageAutoResize: false,
                userLabels: { "firebase-data-connect": args.freeTrial ? "ft" : "nt" },
                insightsConfig: {
                    queryInsightsEnabled: true,
                    queryPlansPerMinute: 5,
                    queryStringLength: 1024, // Match the default settings
                },
            },
        });
        return;
    }
    catch (err) {
        handleAllowlistError(err, args.location);
        throw err;
    }
}
exports.createInstance = createInstance;
/**
 * Update an existing CloudSQL instance to have any required settings for Firebase Data Connect.
 */
async function updateInstanceForDataConnect(instance, enableGoogleMlIntegration) {
    let dbFlags = setDatabaseFlag({ name: "cloudsql.iam_authentication", value: "on" }, instance.settings.databaseFlags);
    if (enableGoogleMlIntegration) {
        dbFlags = setDatabaseFlag({ name: "cloudsql.enable_google_ml_integration", value: "on" }, dbFlags);
    }
    const op = await client.patch(`projects/${instance.project}/instances/${instance.name}`, {
        settings: {
            ipConfiguration: {
                ipv4Enabled: true,
            },
            databaseFlags: dbFlags,
            enableGoogleMlIntegration,
        },
    });
    const opName = `projects/${instance.project}/operations/${op.body.name}`;
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.cloudSQLAdminOrigin)(),
        apiVersion: API_VERSION,
        operationResourceName: opName,
        doneFn: (op) => op.status === "DONE",
        masterTimeout: 1200000, // This operation frequently takes 5+ minutes
    });
    return pollRes;
}
exports.updateInstanceForDataConnect = updateInstanceForDataConnect;
function handleAllowlistError(err, region) {
    if (err.message.includes("Not allowed to set system label: firebase-data-connect")) {
        throw new error_1.FirebaseError(`Cloud SQL free trial instances are not yet available in ${region}. Please check https://firebase.google.com/docs/data-connect/ for a full list of available regions.`);
    }
}
function setDatabaseFlag(flag, flags = []) {
    const temp = flags.filter((f) => f.name !== flag.name);
    temp.push(flag);
    return temp;
}
async function listDatabases(projectId, instanceId) {
    const res = await client.get(`projects/${projectId}/instances/${instanceId}/databases`);
    return res.body.items;
}
exports.listDatabases = listDatabases;
async function getDatabase(projectId, instanceId, databaseId) {
    const res = await client.get(`projects/${projectId}/instances/${instanceId}/databases/${databaseId}`);
    return res.body;
}
exports.getDatabase = getDatabase;
async function createDatabase(projectId, instanceId, databaseId) {
    const op = await client.post(`projects/${projectId}/instances/${instanceId}/databases`, {
        project: projectId,
        instance: instanceId,
        name: databaseId,
    });
    const opName = `projects/${projectId}/operations/${op.body.name}`;
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.cloudSQLAdminOrigin)(),
        apiVersion: API_VERSION,
        operationResourceName: opName,
        doneFn: (op) => op.status === "DONE",
    });
    return pollRes;
}
exports.createDatabase = createDatabase;
async function deleteDatabase(projectId, instanceId, databaseId) {
    const res = await client.delete(`projects/${projectId}/instances/${instanceId}/databases/${databaseId}`);
    return res.body;
}
exports.deleteDatabase = deleteDatabase;
async function createUser(projectId, instanceId, type, username, password, retryTimeout) {
    const maxRetries = 3;
    let retries = 0;
    while (true) {
        try {
            const op = await client.post(`projects/${projectId}/instances/${instanceId}/users`, {
                name: username,
                instance: instanceId,
                project: projectId,
                password: password,
                sqlserverUserDetails: {
                    disabled: false,
                    serverRoles: ["cloudsqlsuperuser"],
                },
                type,
            });
            const opName = `projects/${projectId}/operations/${op.body.name}`;
            const pollRes = await operationPoller.pollOperation({
                apiOrigin: (0, api_1.cloudSQLAdminOrigin)(),
                apiVersion: API_VERSION,
                operationResourceName: opName,
                doneFn: (op) => op.status === "DONE",
            });
            return pollRes;
        }
        catch (err) {
            if (builtinRoleNotReady(err.message) && retries < maxRetries) {
                retries++;
                await new Promise((resolve) => {
                    setTimeout(resolve, retryTimeout ?? 1000 * retries);
                });
            }
            else {
                throw err;
            }
        }
    }
}
exports.createUser = createUser;
// CloudSQL built in roles get created _after_ the operation is complete.
// This means that we occasionally bump into cases where we try to create the user
// before the role required for IAM users exists.
function builtinRoleNotReady(message) {
    return message.includes("cloudsqliamuser");
}
async function getUser(projectId, instanceId, username) {
    const res = await client.get(`projects/${projectId}/instances/${instanceId}/users/${username}`);
    return res.body;
}
exports.getUser = getUser;
async function deleteUser(projectId, instanceId, username) {
    const res = await client.delete(`projects/${projectId}/instances/${instanceId}/users`, {
        queryParams: {
            name: username,
        },
    });
    return res.body;
}
exports.deleteUser = deleteUser;
async function listUsers(projectId, instanceId) {
    const res = await client.get(`projects/${projectId}/instances/${instanceId}/users`);
    return res.body.items;
}
exports.listUsers = listUsers;
//# sourceMappingURL=cloudsqladmin.js.map