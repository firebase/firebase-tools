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
exports.getInquirerDefault = exports.promptCreateSecret = exports.askForParam = exports.ask = exports.checkResponse = exports.SecretLocation = void 0;
const _ = __importStar(require("lodash"));
const clc = __importStar(require("colorette"));
const marked_1 = require("marked");
const types_1 = require("./types");
const secretManagerApi = __importStar(require("../gcp/secretManager"));
const secretsUtils = __importStar(require("./secretsUtils"));
const extensionsHelper_1 = require("./extensionsHelper");
const utils_1 = require("./utils");
const logger_1 = require("../logger");
const prompt_1 = require("../prompt");
const utils = __importStar(require("../utils"));
const projectUtils_1 = require("../projectUtils");
const functional_1 = require("../functional");
/**
 * Location where the secret value is stored.
 *
 * Visible for testing.
 */
var SecretLocation;
(function (SecretLocation) {
    SecretLocation[SecretLocation["CLOUD"] = 1] = "CLOUD";
    SecretLocation[SecretLocation["LOCAL"] = 2] = "LOCAL";
})(SecretLocation = exports.SecretLocation || (exports.SecretLocation = {}));
var SecretUpdateAction;
(function (SecretUpdateAction) {
    SecretUpdateAction[SecretUpdateAction["LEAVE"] = 1] = "LEAVE";
    SecretUpdateAction[SecretUpdateAction["SET_NEW"] = 2] = "SET_NEW";
})(SecretUpdateAction || (SecretUpdateAction = {}));
/**
 * Validates the user's response for param value against the param spec
 * @param response The user's response
 * @param spec The param spec
 * @return True if the user's response is valid
 */
function checkResponse(response, spec) {
    let valid = true;
    let responses;
    if (spec.required && (response === "" || response === undefined)) {
        utils.logWarning(`Param ${spec.param} is required, but no value was provided.`);
        return false;
    }
    if (spec.type === types_1.ParamType.MULTISELECT) {
        responses = response.split(",");
    }
    else {
        // For Params of type SELECT and STRING, we test against the entire response.
        responses = [response];
    }
    if (spec.validationRegex && !!response) {
        // !!response to ignore empty optional params
        const re = new RegExp(spec.validationRegex);
        for (const resp of responses) {
            if ((spec.required || resp !== "") && !re.test(resp)) {
                const genericWarn = `${resp} is not a valid value for ${spec.param} since it` +
                    ` does not meet the requirements of the regex validation: "${spec.validationRegex}"`;
                utils.logWarning(spec.validationErrorMessage || genericWarn);
                valid = false;
            }
        }
    }
    if (spec.type && (spec.type === types_1.ParamType.MULTISELECT || spec.type === types_1.ParamType.SELECT)) {
        for (const r of responses) {
            // A choice is valid if it matches one of the option values.
            const validChoice = spec.options?.some((option) => r === option.value);
            if (r && !validChoice) {
                utils.logWarning(`${r} is not a valid option for ${spec.param}.`);
                valid = false;
            }
        }
    }
    return valid;
}
exports.checkResponse = checkResponse;
/**
 * Prompt users for params based on paramSpecs defined by the extension developer.
 * @param args.projectId The projectId for the params
 * @param args.instanceId The instanceId for the params
 * @param args.paramSpecs Array of params to ask the user about, parsed from extension.yaml.
 * @param args.firebaseProjectParams Autopopulated Firebase project-specific params
 * @return Promisified map of env vars to values.
 */
async function ask(args) {
    if (_.isEmpty(args.paramSpecs)) {
        logger_1.logger.debug("No params were specified for this extension.");
        return {};
    }
    utils.logLabeledBullet(extensionsHelper_1.logPrefix, "answer the questions below to configure your extension:");
    const substituted = (0, extensionsHelper_1.substituteParams)(args.paramSpecs, args.firebaseProjectParams);
    const [advancedParams, standardParams] = (0, functional_1.partition)(substituted, (p) => p.advanced ?? false);
    const result = {};
    const promises = standardParams.map((paramSpec) => {
        return async () => {
            result[paramSpec.param] = await askForParam({
                projectId: args.projectId,
                instanceId: args.instanceId,
                paramSpec: paramSpec,
                reconfiguring: args.reconfiguring,
            });
        };
    });
    if (advancedParams.length) {
        promises.push(async () => {
            const shouldPrompt = await (0, prompt_1.confirm)("Do you want to configure any advanced parameters for this instance?");
            if (shouldPrompt) {
                const advancedPromises = advancedParams.map((paramSpec) => {
                    return async () => {
                        result[paramSpec.param] = await askForParam({
                            projectId: args.projectId,
                            instanceId: args.instanceId,
                            paramSpec: paramSpec,
                            reconfiguring: args.reconfiguring,
                        });
                    };
                });
                await advancedPromises.reduce((prev, cur) => prev.then(cur), Promise.resolve());
            }
            else {
                for (const paramSpec of advancedParams) {
                    if (paramSpec.required && paramSpec.default) {
                        result[paramSpec.param] = { baseValue: paramSpec.default };
                    }
                }
            }
        });
    }
    // chaining together the promises so they get executed one after another
    await promises.reduce((prev, cur) => prev.then(cur), Promise.resolve());
    logger_1.logger.info();
    return result;
}
exports.ask = ask;
/**
 * Asks the user for values for the extension parameter.
 * @param args.projectId The projectId we are installing into
 * @param args.instanceId The instanceId we are creating/updating/configuring
 * @param args.paramSpec The spec for the param we are asking about
 * @param args.reconfiguring If true we will reconfigure a secret
 * @return ParamBindingOptions to specify the selected value(s) for the parameter.
 */
async function askForParam(args) {
    const paramSpec = args.paramSpec;
    let valid = false;
    let response = "";
    let responseForLocal;
    let secretLocations = [];
    const description = paramSpec.description || "";
    const label = paramSpec.label.trim();
    logger_1.logger.info(`\n${clc.bold(label)}${clc.bold(paramSpec.required ? "" : " (Optional)")}: ${(await (0, marked_1.marked)(description)).trim()}`);
    while (!valid) {
        switch (paramSpec.type) {
            case types_1.ParamType.SELECT:
                response = await (0, prompt_1.select)({
                    default: paramSpec.default
                        ? getInquirerDefault(_.get(paramSpec, "options", []), paramSpec.default)
                        : undefined,
                    message: "Which option do you want enabled for this parameter? " +
                        "Select an option with the arrow keys, and use Enter to confirm your choice. " +
                        "You may only select one option.",
                    choices: (0, utils_1.convertExtensionOptionToLabeledList)(paramSpec.options),
                });
                valid = checkResponse(response, paramSpec);
                break;
            case types_1.ParamType.MULTISELECT:
                response = (await (0, prompt_1.checkbox)({
                    default: paramSpec.default
                        ? paramSpec.default.split(",").map((def) => {
                            return getInquirerDefault(_.get(paramSpec, "options", []), def);
                        })
                        : undefined,
                    message: "Which options do you want enabled for this parameter? " +
                        "Press Space to select, then Enter to confirm your choices. ",
                    choices: (0, utils_1.convertExtensionOptionToLabeledList)(paramSpec.options),
                })).join(",");
                valid = checkResponse(response, paramSpec);
                break;
            case types_1.ParamType.SECRET:
                do {
                    secretLocations = await promptSecretLocations(paramSpec);
                } while (!isValidSecretLocations(secretLocations, paramSpec));
                if (secretLocations.includes(SecretLocation.CLOUD.toString())) {
                    // TODO(lihes): evaluate the UX of this error message.
                    const projectId = (0, projectUtils_1.needProjectId)({ projectId: args.projectId });
                    response = args.reconfiguring
                        ? await promptReconfigureSecret(projectId, args.instanceId, paramSpec)
                        : await promptCreateSecret(projectId, args.instanceId, paramSpec);
                }
                if (secretLocations.includes(SecretLocation.LOCAL.toString())) {
                    responseForLocal = await promptLocalSecret(args.instanceId, paramSpec);
                }
                valid = true;
                break;
            default:
                // Default to ParamType.STRING
                response = await (0, prompt_1.input)({
                    default: paramSpec.default,
                    message: `Enter a value for ${label}:`,
                });
                valid = checkResponse(response, paramSpec);
        }
    }
    return { baseValue: response, ...(responseForLocal ? { local: responseForLocal } : {}) };
}
exports.askForParam = askForParam;
function isValidSecretLocations(secretLocations, paramSpec) {
    if (paramSpec.required) {
        return !!secretLocations.length;
    }
    return true;
}
async function promptSecretLocations(paramSpec) {
    if (paramSpec.required) {
        return await (0, prompt_1.checkbox)({
            message: "Where would you like to store your secrets? You must select at least one value",
            choices: [
                {
                    checked: true,
                    name: "Google Cloud Secret Manager (Used by deployed extensions and emulator)",
                    // return type of string is not actually enforced, need to manually convert.
                    value: SecretLocation.CLOUD.toString(),
                },
                {
                    checked: false,
                    name: "Local file (Used by emulator only)",
                    value: SecretLocation.LOCAL.toString(),
                },
            ],
        });
    }
    return await (0, prompt_1.checkbox)({
        message: "Where would you like to store your secrets? " +
            "If you don't want to set this optional secret, leave both options unselected to skip it",
        choices: [
            {
                checked: false,
                name: "Google Cloud Secret Manager (Used by deployed extensions and emulator)",
                // return type of string is not actually enforced, need to manually convert.
                value: SecretLocation.CLOUD.toString(),
            },
            {
                checked: false,
                name: "Local file (Used by emulator only)",
                value: SecretLocation.LOCAL.toString(),
            },
        ],
    });
}
async function promptLocalSecret(instanceId, paramSpec) {
    let value;
    do {
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, "Configure a local secret value for Extensions Emulator");
        value = await (0, prompt_1.input)(`This secret will be stored in ./extensions/${instanceId}.secret.local.\n` +
            `Enter value for "${paramSpec.label.trim()}" to be used by Extensions Emulator:`);
    } while (!value);
    return value;
}
async function promptReconfigureSecret(projectId, instanceId, paramSpec) {
    const action = await (0, prompt_1.select)({
        message: `Choose what you would like to do with this secret:`,
        choices: [
            { name: "Leave unchanged", value: SecretUpdateAction.LEAVE },
            { name: "Set new value", value: SecretUpdateAction.SET_NEW },
        ],
    });
    switch (action) {
        case SecretUpdateAction.SET_NEW: {
            let secret;
            let secretName;
            if (paramSpec.default) {
                secret = secretManagerApi.parseSecretResourceName(paramSpec.default);
                secretName = secret.name;
            }
            else {
                secretName = await generateSecretName(projectId, instanceId, paramSpec.param);
            }
            const secretValue = await (0, prompt_1.password)(`This secret will be stored in Cloud Secret Manager as ${secretName}.\nEnter new value for ${paramSpec.label.trim()}:`);
            if (secretValue === "" && paramSpec.required) {
                logger_1.logger.info(`Secret value cannot be empty for required param ${paramSpec.param}`);
                return promptReconfigureSecret(projectId, instanceId, paramSpec);
            }
            else if (secretValue !== "") {
                if (checkResponse(secretValue, paramSpec)) {
                    if (!secret) {
                        secret = await secretManagerApi.createSecret(projectId, secretName, secretsUtils.getSecretLabels(instanceId));
                    }
                    return addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue);
                }
                else {
                    return promptReconfigureSecret(projectId, instanceId, paramSpec);
                }
            }
            else {
                return "";
            }
        }
        case SecretUpdateAction.LEAVE:
        default:
            return paramSpec.default || "";
    }
}
/**
 * Prompts the user to create a secret
 * @param projectId The projectId to create the secret in
 * @param instanceId The instanceId for the secret
 * @param paramSpec The secret param spec
 * @param secretName (Optional) The name to store the secret as
 * @return The resource name of a new secret version or empty string if no secret is created.
 */
async function promptCreateSecret(projectId, instanceId, paramSpec, secretName) {
    const name = secretName ?? (await generateSecretName(projectId, instanceId, paramSpec.param));
    // N.B. Is it actually possible to have a default value for a password?!
    const secretValue = (await (0, prompt_1.password)({
        message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${name} and managed by Firebase Extensions (Firebase Extensions Service Agent will be granted Secret Admin role on this secret).\nEnter a value for ${paramSpec.label.trim()}:`,
    })) ||
        paramSpec.default ||
        "";
    if (secretValue === "" && paramSpec.required) {
        logger_1.logger.info(`Secret value cannot be empty for required param ${paramSpec.param}`);
        return promptCreateSecret(projectId, instanceId, paramSpec, name);
    }
    else if (secretValue !== "") {
        if (checkResponse(secretValue, paramSpec)) {
            const secret = await secretManagerApi.createSecret(projectId, name, secretsUtils.getSecretLabels(instanceId));
            return addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue);
        }
        else {
            return promptCreateSecret(projectId, instanceId, paramSpec, name);
        }
    }
    else {
        return "";
    }
}
exports.promptCreateSecret = promptCreateSecret;
async function generateSecretName(projectId, instanceId, paramName) {
    let secretName = `ext-${instanceId}-${paramName}`;
    while (await secretManagerApi.secretExists(projectId, secretName)) {
        secretName += `-${(0, utils_1.getRandomString)(3)}`;
    }
    return secretName;
}
async function addNewSecretVersion(projectId, instanceId, secret, paramSpec, secretValue) {
    const version = await secretManagerApi.addVersion(projectId, secret.name, secretValue);
    await secretsUtils.grantFirexServiceAgentSecretAdminRole(secret);
    return `projects/${version.secret.projectId}/secrets/${version.secret.name}/versions/${version.versionId}`;
}
/**
 * Finds the label or value of a default option if the option is found in options
 * @param options The param options to search for default
 * @param def The value of the default to search for
 * @return The label or value of the default if present or empty string if not.
 */
function getInquirerDefault(options, def) {
    const defaultOption = options.find((o) => o.value === def);
    return defaultOption ? defaultOption.label || defaultOption.value : "";
}
exports.getInquirerDefault = getInquirerDefault;
//# sourceMappingURL=askUserForParam.js.map