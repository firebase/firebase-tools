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
exports.prettySecretName = exports.getSecretLabels = exports.getActiveSecrets = exports.getManagedSecrets = exports.grantFirexServiceAgentSecretAdminRole = exports.usesSecrets = exports.ensureSecretManagerApiEnabled = exports.SECRET_ROLE = exports.SECRET_LABEL = void 0;
const getProjectNumber_1 = require("../getProjectNumber");
const utils = __importStar(require("../utils"));
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const projectUtils_1 = require("../projectUtils");
const types_1 = require("./types");
const secretManagerApi = __importStar(require("../gcp/secretManager"));
const logger_1 = require("../logger");
const api_1 = require("../api");
exports.SECRET_LABEL = "firebase-extensions-managed";
exports.SECRET_ROLE = "secretmanager.secretAccessor";
async function ensureSecretManagerApiEnabled(options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    return await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.secretManagerOrigin)(), "extensions", options.markdown);
}
exports.ensureSecretManagerApiEnabled = ensureSecretManagerApiEnabled;
function usesSecrets(spec) {
    return spec.params && !!spec.params.find((p) => p.type === types_1.ParamType.SECRET);
}
exports.usesSecrets = usesSecrets;
async function grantFirexServiceAgentSecretAdminRole(secret) {
    const projectNumber = await (0, getProjectNumber_1.getProjectNumber)({ projectId: secret.projectId });
    const firexSaProjectId = utils.envOverride("FIREBASE_EXTENSIONS_SA_PROJECT_ID", "gcp-sa-firebasemods");
    const saEmail = `service-${projectNumber}@${firexSaProjectId}.iam.gserviceaccount.com`;
    return secretManagerApi.ensureServiceAgentRole(secret, [saEmail], "roles/secretmanager.admin");
}
exports.grantFirexServiceAgentSecretAdminRole = grantFirexServiceAgentSecretAdminRole;
async function getManagedSecrets(instance) {
    return (await Promise.all(getActiveSecrets(instance.config.source.spec, instance.config.params).map(async (secretResourceName) => {
        const secret = secretManagerApi.parseSecretResourceName(secretResourceName);
        const labels = (await secretManagerApi.getSecret(secret.projectId, secret.name)).labels;
        if (labels && labels[exports.SECRET_LABEL]) {
            return secretResourceName;
        }
        return Promise.resolve("");
    }))).filter((secretId) => !!secretId);
}
exports.getManagedSecrets = getManagedSecrets;
function getActiveSecrets(spec, params) {
    return spec.params
        .map((p) => (p.type === types_1.ParamType.SECRET ? params[p.param] : ""))
        .filter((pv) => !!pv);
}
exports.getActiveSecrets = getActiveSecrets;
function getSecretLabels(instanceId) {
    const labels = {};
    labels[exports.SECRET_LABEL] = instanceId;
    return labels;
}
exports.getSecretLabels = getSecretLabels;
function prettySecretName(secretResourceName) {
    const nameTokens = secretResourceName.split("/");
    if (nameTokens.length !== 4 && nameTokens.length !== 6) {
        // not a familiar format, return as is
        logger_1.logger.debug(`unable to parse secret secretResourceName: ${secretResourceName}`);
        return secretResourceName;
    }
    return nameTokens.slice(0, 4).join("/");
}
exports.prettySecretName = prettySecretName;
//# sourceMappingURL=secretsUtils.js.map