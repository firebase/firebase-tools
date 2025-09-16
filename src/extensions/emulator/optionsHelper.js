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
exports.getParams = exports.getSecretEnvVars = exports.getNonSecretEnv = exports.getExtensionFunctionInfo = void 0;
const paramHelper = __importStar(require("../paramHelper"));
const specHelper = __importStar(require("./specHelper"));
const triggerHelper = __importStar(require("./triggerHelper"));
const types_1 = require("../types");
const extensionsHelper = __importStar(require("../extensionsHelper"));
const planner = __importStar(require("../../deploy/extensions/planner"));
const projectUtils_1 = require("../../projectUtils");
/**
 * TODO: Better name? Also, should this be in extensionsEmulator instead?
 */
async function getExtensionFunctionInfo(instance, paramValues) {
    const spec = await planner.getExtensionSpec(instance);
    const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(spec, paramValues);
    const extensionTriggers = functionResources
        .map((r) => triggerHelper.functionResourceToEmulatedTriggerDefintion(r, instance.systemParams))
        .map((trigger) => {
        trigger.name = `ext-${instance.instanceId}-${trigger.name}`;
        return trigger;
    });
    const runtime = specHelper.getRuntime(functionResources);
    const nonSecretEnv = getNonSecretEnv(spec.params ?? [], paramValues);
    const secretEnvVariables = getSecretEnvVars(spec.params ?? [], paramValues);
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
//# sourceMappingURL=optionsHelper.js.map