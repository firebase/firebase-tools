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
exports.getRuntime = exports.DEFAULT_RUNTIME = exports.getFunctionProperties = exports.getFunctionResourcesWithParamSubstitution = exports.readPostinstall = exports.readExtensionYaml = void 0;
const supported = __importStar(require("../../deploy/functions/runtimes/supported"));
const error_1 = require("../../error");
const extensionsHelper_1 = require("../extensionsHelper");
const utils_1 = require("../utils");
const utils_2 = require("../../utils");
const SPEC_FILE = "extension.yaml";
const POSTINSTALL_FILE = "POSTINSTALL.md";
const validFunctionTypes = [
    "firebaseextensions.v1beta.function",
    "firebaseextensions.v1beta.v2function",
    "firebaseextensions.v1beta.scheduledFunction",
];
/**
 * Reads an extension.yaml and parses its contents into an ExtensionSpec.
 * @param directory the directory to look for a extensionYaml in.
 */
async function readExtensionYaml(directory) {
    const extensionYaml = await (0, utils_2.readFileFromDirectory)(directory, SPEC_FILE);
    const source = extensionYaml.source;
    const spec = (0, utils_2.wrappedSafeLoad)(source);
    // Ensure that any omitted array fields are initialized as empty arrays
    spec.params = spec.params ?? [];
    spec.systemParams = spec.systemParams ?? [];
    spec.resources = spec.resources ?? [];
    spec.apis = spec.apis ?? [];
    spec.roles = spec.roles ?? [];
    spec.externalServices = spec.externalServices ?? [];
    spec.events = spec.events ?? [];
    spec.lifecycleEvents = spec.lifecycleEvents ?? [];
    spec.contributors = spec.contributors ?? [];
    return spec;
}
exports.readExtensionYaml = readExtensionYaml;
/**
 * Reads a POSTINSTALL file and returns its content as a string
 * @param directory the directory to look for POSTINSTALL.md in.
 */
async function readPostinstall(directory) {
    const content = await (0, utils_2.readFileFromDirectory)(directory, POSTINSTALL_FILE);
    return content.source;
}
exports.readPostinstall = readPostinstall;
/**
 * Substitue parameters of function resources in the extensions spec.
 */
function getFunctionResourcesWithParamSubstitution(extensionSpec, params) {
    const rawResources = extensionSpec.resources.filter((resource) => validFunctionTypes.includes(resource.type));
    return (0, extensionsHelper_1.substituteParams)(rawResources, params);
}
exports.getFunctionResourcesWithParamSubstitution = getFunctionResourcesWithParamSubstitution;
/**
 * Get properties associated with the function resource.
 */
function getFunctionProperties(resources) {
    return resources.map((r) => r.properties);
}
exports.getFunctionProperties = getFunctionProperties;
exports.DEFAULT_RUNTIME = supported.latest("nodejs");
/**
 * Get runtime associated with the resources. If multiple runtimes exists, choose the latest runtime.
 * e.g. prefer nodejs14 over nodejs12.
 * N.B. (inlined): I'm not sure why this code always assumes nodejs. It seems to
 *   work though and nobody is complaining that they can't run the Python
 *   emulator so I'm not investigating why it works.
 */
function getRuntime(resources) {
    if (resources.length === 0) {
        return exports.DEFAULT_RUNTIME;
    }
    const invalidRuntimes = [];
    const runtimes = resources.map((r) => {
        const runtime = (0, utils_1.getResourceRuntime)(r);
        if (!runtime) {
            return exports.DEFAULT_RUNTIME;
        }
        if (!supported.runtimeIsLanguage(runtime, "nodejs")) {
            invalidRuntimes.push(runtime);
            return exports.DEFAULT_RUNTIME;
        }
        return runtime;
    });
    if (invalidRuntimes.length) {
        throw new error_1.FirebaseError(`The following runtimes are not supported by the Emulator Suite: ${invalidRuntimes.join(", ")}. \n Only Node runtimes are supported.`);
    }
    // Assumes that all runtimes target the nodejs.
    return supported.latest("nodejs", runtimes);
}
exports.getRuntime = getRuntime;
//# sourceMappingURL=specHelper.js.map