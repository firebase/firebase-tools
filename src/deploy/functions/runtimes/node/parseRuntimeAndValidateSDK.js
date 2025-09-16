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
exports.getRuntimeChoice = exports.RUNTIME_NOT_SET = void 0;
const path = __importStar(require("path"));
const error_1 = require("../../../../error");
const supported = __importStar(require("../supported"));
// have to require this because no @types/cjson available
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cjson = require("cjson");
const supportedNodeVersions = Object.keys(supported.RUNTIMES)
    .filter((s) => supported.runtimeIsLanguage(s, "nodejs"))
    .filter((s) => !supported.isDecommissioned(s))
    .map((s) => s.substring("nodejs".length));
exports.RUNTIME_NOT_SET = "`runtime` field is required but was not found in firebase.json or package.json.\n" +
    "To fix this, add the following lines to the `functions` section of your firebase.json:\n" +
    `"runtime": "${supported.latest("nodejs")}" or set the "engine" field in package.json\n`;
function getRuntimeChoiceFromPackageJson(sourceDir) {
    const packageJsonPath = path.join(sourceDir, "package.json");
    let loaded;
    try {
        loaded = cjson.load(packageJsonPath);
    }
    catch (err) {
        throw new error_1.FirebaseError(`Unable to load ${packageJsonPath}: ${err}`);
    }
    const engines = loaded.engines;
    if (!engines || !engines.node) {
        // It's a little strange, but we're throwing an error telling customers to put runtime in firebase.json
        // if it isn't set in package.json. This is because we know through the order of function calls (note this
        // method isn't exported) that this condition is only hit if we've checked both firebase.json and
        // package.json.
        throw new error_1.FirebaseError(exports.RUNTIME_NOT_SET);
    }
    const runtime = `nodejs${engines.node}`;
    if (!supported.isRuntime(runtime)) {
        throw new error_1.FirebaseError(`Detected node engine ${engines.node} in package.json, which is not a ` +
            `supported version. Valid versions are ${supportedNodeVersions.join(", ")}`);
    }
    return runtime;
}
/**
 * Returns the Node.js version to be used for the function(s) as defined in the
 * either the `runtime` field of firebase.json or the package.json.
 * @param sourceDir directory where the functions are defined.
 * @param runtimeFromConfig runtime from the `functions` section of firebase.json file (may be empty).
 * @return The runtime, e.g. `nodejs12`.
 */
function getRuntimeChoice(sourceDir, runtimeFromConfig) {
    return runtimeFromConfig || getRuntimeChoiceFromPackageJson(sourceDir);
}
exports.getRuntimeChoice = getRuntimeChoice;
//# sourceMappingURL=parseRuntimeAndValidateSDK.js.map