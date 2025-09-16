"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParams = exports.getSecretEnvVars = exports.getNonSecretEnv = exports.getExtensionFunctionInfo = void 0;
const paramHelper = require("../paramHelper");
const specHelper = require("./specHelper");
const triggerHelper = require("./triggerHelper");
const types_1 = require("../types");
const extensionsHelper = require("../extensionsHelper");
const planner = require("../../deploy/extensions/planner");
const projectUtils_1 = require("../../projectUtils");
/**
 * TODO: Better name? Also, should this be in extensionsEmulator instead?
 */
async function getExtensionFunctionInfo(instance, paramValues) {
    var _a, _b;
    const spec = await planner.getExtensionSpec(instance);
    const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(spec, paramValues);
    const extensionTriggers = functionResources
        .map((r) => triggerHelper.functionResourceToEmulatedTriggerDefintion(r, instance.systemParams))
        .map((trigger) => {
        trigger.name = `ext-${instance.instanceId}-${trigger.name}`;
        return trigger;
    });
    const runtime = specHelper.getRuntime(functionResources);
    const nonSecretEnv = getNonSecretEnv((_a = spec.params) !== null && _a !== void 0 ? _a : [], paramValues);
    const secretEnvVariables = getSecretEnvVars((_b = spec.params) !== null && _b !== void 0 ? _b : [], paramValues);
    return {
        extensionTriggers,
        runtime,
        nonSecretEnv,
        secretEnvVariables,
    };
}
exports.getExtensionFunctionInfo = getExtensionFunctionInfo;
const isSecretParam = (p) => p.type === extensionsHelper.SpecParamType.SECRET || p.type === types_1.ParamType.SECRET;
/**
 * getNonSecretEnv checks extension spec for secret params, and returns env without those secret params
 * @param params A list of params to check for secret params
 * @param paramValues A Record of all params to their values
 */
function getNonSecretEnv(params, paramValues) {
    const getNonSecretEnv = Object.assign({}, paramValues);
    const secretParams = params.filter(isSecretParam);
    for (const p of secretParams) {
        delete getNonSecretEnv[p.param];
    }
    return getNonSecretEnv;
}
exports.getNonSecretEnv = getNonSecretEnv;
/**
 * getSecretEnvVars checks which params are secret, and returns a list of SecretEnvVar for each one that is is in use
 * @param params A list of params to check for secret params
 * @param paramValues A Record of all params to their values
 */
function getSecretEnvVars(params, paramValues) {
    const secretEnvVar = [];
    const secretParams = params.filter(isSecretParam);
    for (const s of secretParams) {
        if (paramValues[s.param]) {
            const [, projectId, , secret, , version] = paramValues[s.param].split("/");
            secretEnvVar.push({
                key: s.param,
                secret,
                projectId,
                version,
            });
        }
        // TODO: Throw an error if a required secret is missing?
    }
    return secretEnvVar;
}
exports.getSecretEnvVars = getSecretEnvVars;
/**
 * Exported for testing
 */
function getParams(options, extensionSpec) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const userParams = paramHelper.readEnvFile(options.testParams);
    const autoParams = {
        PROJECT_ID: projectId,
        EXT_INSTANCE_ID: extensionSpec.name,
        DATABASE_INSTANCE: projectId,
        DATABASE_URL: `https://${projectId}.firebaseio.com`,
        STORAGE_BUCKET: `${projectId}.appspot.com`,
    };
    const unsubbedParamsWithoutDefaults = Object.assign(autoParams, userParams);
    const unsubbedParams = extensionsHelper.populateDefaultParams(unsubbedParamsWithoutDefaults, extensionSpec.params);
    // Run a substitution to support params that reference other params.
    return extensionsHelper.substituteParams(unsubbedParams, unsubbedParams);
}
exports.getParams = getParams;
