"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionsProxy = void 0;
const lodash_1 = require("lodash");
const proxy_1 = require("./proxy");
const projectUtils_1 = require("../projectUtils");
const registry_1 = require("../emulator/registry");
const types_1 = require("../emulator/types");
const functionsEmulator_1 = require("../emulator/functionsEmulator");
const error_1 = require("../error");
/**
 * Returns a function which, given a FunctionProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to a
 * hosted or live function.
 */
function functionsProxy(options) {
    return (rewrite) => {
        return new Promise((resolve) => {
            const projectId = (0, projectUtils_1.needProjectId)(options);
            if (!("function" in rewrite)) {
                throw new error_1.FirebaseError(`A non-function rewrite cannot be used in functionsProxy`, {
                    exit: 2,
                });
            }
            let functionId;
            let region;
            if (typeof rewrite.function === "string") {
                functionId = rewrite.function;
                region = rewrite.region || "us-central1";
            }
            else {
                functionId = rewrite.function.functionId;
                region = rewrite.function.region || "us-central1";
            }
            let url = `https://${region}-${projectId}.cloudfunctions.net/${functionId}`;
            let destLabel = "live";
            if ((0, lodash_1.includes)(options.targets, "functions")) {
                destLabel = "local";
                // If the functions emulator is running we know the port, otherwise
                // things still point to production.
                if (registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FUNCTIONS)) {
                    url = functionsEmulator_1.FunctionsEmulator.getHttpFunctionUrl(projectId, functionId, region);
                }
            }
            resolve((0, proxy_1.proxyRequestHandler)(url, `${destLabel} Function ${region}/${functionId}`));
        });
    };
}
exports.functionsProxy = functionsProxy;
//# sourceMappingURL=functionsProxy.js.map