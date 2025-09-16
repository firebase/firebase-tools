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
exports.checkSpecForSecrets = exports.handleSecretParams = void 0;
const clc = __importStar(require("colorette"));
const secretUtils = __importStar(require("../../extensions/secretsUtils"));
const secretManager = __importStar(require("../../gcp/secretManager"));
const planner_1 = require("./planner");
const askUserForParam_1 = require("../../extensions/askUserForParam");
const types_1 = require("../../extensions/types");
const error_1 = require("../../error");
const logger_1 = require("../../logger");
const utils_1 = require("../../utils");
/**
 * handleSecretParams checks each spec for secret params, and validates that the secrets in the configuration exist.
 * If they don't, it prompts the user to create them in interactive mode
 * or throws an informative error in non-interactive mode
 * @param payload The deploy payload
 * @param have The instances currently installed on the project.
 * @param nonInteractive whether the user can be prompted to create secrets that are missing.
 */
async function handleSecretParams(payload, have, nonInteractive) {
    for (const i of payload.instancesToCreate ?? []) {
        if (await checkSpecForSecrets(i)) {
            (0, utils_1.logLabeledBullet)("extensions", `Verifying secret params for ${clc.bold(i.instanceId)}`);
            await handleSecretsCreateInstance(i, nonInteractive);
        }
    }
    const updates = [...(payload.instancesToUpdate ?? []), ...(payload.instancesToConfigure ?? [])];
    for (const i of updates) {
        if (await checkSpecForSecrets(i)) {
            (0, utils_1.logLabeledBullet)("extensions", `Verifying secret params for ${clc.bold(i.instanceId)}`);
            const previousSpec = have.find((h) => h.instanceId === i.instanceId);
            await handleSecretsUpdateInstance(i, previousSpec, nonInteractive);
        }
    }
}
exports.handleSecretParams = handleSecretParams;
async function checkSpecForSecrets(i) {
    const extensionSpec = await (0, planner_1.getExtensionSpec)(i);
    return secretUtils.usesSecrets(extensionSpec);
}
exports.checkSpecForSecrets = checkSpecForSecrets;
const secretsInSpec = (spec) => {
    return spec.params.filter((p) => p.type === types_1.ParamType.SECRET);
};
async function handleSecretsCreateInstance(i, nonInteractive) {
    const spec = await (0, planner_1.getExtensionSpec)(i);
    const secretParams = secretsInSpec(spec);
    for (const s of secretParams) {
        await handleSecretParamForCreate(s, i, nonInteractive);
    }
}
async function handleSecretsUpdateInstance(i, prevSpec, nonInteractive) {
    const extensionVersion = await (0, planner_1.getExtensionVersion)(i);
    const prevExtensionVersion = await (0, planner_1.getExtensionVersion)(prevSpec);
    const secretParams = secretsInSpec(extensionVersion.spec);
    for (const s of secretParams) {
        // If this was previously a secret param & was set, treat this as an update
        const prevParam = prevExtensionVersion.spec.params.find((p) => p.param === s.param);
        if (prevParam?.type === types_1.ParamType.SECRET && prevSpec.params[prevParam?.param]) {
            await handleSecretParamForUpdate(s, i, prevSpec.params[prevParam?.param], nonInteractive);
        }
        else {
            // Otherwise, this is a new secret param
            await handleSecretParamForCreate(s, i, nonInteractive);
        }
    }
}
async function handleSecretParamForCreate(secretParam, i, nonInteractive) {
    const providedValue = i.params[secretParam.param];
    if (!providedValue) {
        return;
    }
    // First, check that param is well formed.
    const [, projectId, , secretName, , version] = providedValue.split("/");
    if (!projectId || !secretName || !version) {
        throw new error_1.FirebaseError(`${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${secretParam.param}, but expected a secret version.`);
    }
    // Then, go get all the info about the current state of the secret.
    const secretInfo = await getSecretInfo(projectId, secretName, version);
    // If the secret doesn't exist, prompt the user for a value, create it, and label it.
    if (!secretInfo.secret) {
        await promptForCreateSecret({
            projectId,
            secretName,
            instanceId: i.instanceId,
            secretParam,
            nonInteractive,
        });
        return;
    }
    else if (!secretInfo.secretVersion) {
        throw new error_1.FirebaseError(`${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${secretParam.param}. ` +
            `projects/${projectId}/secrets/${secretName} exists, but version ${version} does not. ` +
            `See more information about this secret at ${secretManager.secretManagerConsoleUri(projectId)}`);
    }
    // If the secret is managed, but by a different extension, error out.
    if (!!secretInfo?.secret?.labels &&
        !!secretInfo?.secret.labels[secretUtils.SECRET_LABEL] &&
        secretInfo.secret.labels[secretUtils.SECRET_LABEL] !== i.instanceId) {
        throw new error_1.FirebaseError(`${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${secretParam.param}. ` +
            `projects/${projectId}/secrets/${secretName} is managed by a different extension instance (${secretInfo.secret.labels[secretUtils.SECRET_LABEL]}), so reusing it here can lead to unexpected behavior. ` +
            "Please choose a different name for this secret, and rerun this command.");
    }
    // If we get to this point, we're OK to just use what was included in the params.
    // Just need to make sure the Extensions P4SA has access.
    await secretUtils.grantFirexServiceAgentSecretAdminRole(secretInfo.secret);
}
async function handleSecretParamForUpdate(secretParam, i, prevValue, nonInteractive) {
    const providedValue = i.params[secretParam.param];
    if (!providedValue) {
        return;
    }
    const [, projectId, , secretName, , version] = providedValue.split("/");
    if (!projectId || !secretName || !version) {
        throw new error_1.FirebaseError(`${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${secretParam.param}, but expected a secret version.`);
    }
    // Don't allow changing secrets, only changing versions
    const [, prevProjectId, , prevSecretName] = prevValue.split("/");
    if (prevSecretName !== secretName) {
        throw new error_1.FirebaseError(`${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${secretParam.param}, ` +
            `but this instance was previously using a different secret projects/${prevProjectId}/secrets/${prevSecretName}.\n` +
            `Changing secrets is not supported. If you want to change the value of this secret, ` +
            `use a new version of projects/${prevProjectId}/secrets/${prevSecretName}.` +
            `You can create a new version at ${secretManager.secretManagerConsoleUri(projectId)}`);
    }
    const secretInfo = await getSecretInfo(projectId, secretName, version);
    if (!secretInfo.secret) {
        i.params[secretParam.param] = await promptForCreateSecret({
            projectId,
            secretName,
            instanceId: i.instanceId,
            secretParam,
            nonInteractive,
        });
        return;
    }
    else if (!secretInfo.secretVersion) {
        throw new error_1.FirebaseError(`${clc.bold(i.instanceId)}: Found '${providedValue}' for secret param ${secretParam.param}. ` +
            `projects/${projectId}/secrets/${secretName} exists, but version ${version} does not. ` +
            `See more information about this secret at ${secretManager.secretManagerConsoleUri(projectId)}`);
    }
    // Set the param value to the exact resource name we get from SecretManager,
    // so 'latest' gets resolved to a version number.
    i.params[secretParam.param] = secretManager.toSecretVersionResourceName(secretInfo.secretVersion);
    // If we get to this point, we're OK to just use what was included in the params.
    // Just need to make sure the Extensions P4SA has access.
    await secretUtils.grantFirexServiceAgentSecretAdminRole(secretInfo.secret);
}
async function getSecretInfo(projectId, secretName, version) {
    const secretInfo = {};
    try {
        secretInfo.secret = await secretManager.getSecret(projectId, secretName);
        secretInfo.secretVersion = await secretManager.getSecretVersion(projectId, secretName, version);
    }
    catch (err) {
        // Throw anything other than the expected 404 errors.
        if (err.status !== 404) {
            throw err;
        }
    }
    return secretInfo;
}
async function promptForCreateSecret(args) {
    logger_1.logger.info(`${clc.bold(args.instanceId)}: Secret ${args.projectId}/${args.secretName} doesn't exist yet.`);
    if (args.nonInteractive) {
        throw new error_1.FirebaseError(`To create this secret, run this command in interactive mode, or go to ${secretManager.secretManagerConsoleUri(args.projectId)}`);
    }
    return (0, askUserForParam_1.promptCreateSecret)(args.projectId, args.instanceId, args.secretParam, args.secretName);
}
//# sourceMappingURL=secrets.js.map