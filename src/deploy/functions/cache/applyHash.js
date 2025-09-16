"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyBackendHashToBackends = void 0;
const backend_1 = require("../backend");
const hash_1 = require("./hash");
/**
 *
 * Updates all the CodeBase {@link Backend}, applying a hash to each of their {@link Endpoint}.
 */
function applyBackendHashToBackends(wantBackends, context) {
    for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
        const source = context?.sources?.[codebase]; // populated earlier in prepare flow
        const envHash = (0, hash_1.getEnvironmentVariablesHash)(wantBackend);
        applyBackendHashToEndpoints(wantBackend, envHash, source?.functionsSourceV1Hash, source?.functionsSourceV2Hash);
    }
}
exports.applyBackendHashToBackends = applyBackendHashToBackends;
/**
 * Updates {@link Backend}, applying a unique hash to each {@link Endpoint}.
 */
function applyBackendHashToEndpoints(wantBackend, envHash, sourceV1Hash, sourceV2Hash) {
    for (const endpoint of (0, backend_1.allEndpoints)(wantBackend)) {
        const secretsHash = (0, hash_1.getSecretsHash)(endpoint);
        const isV2 = endpoint.platform === "gcfv2";
        const sourceHash = isV2 ? sourceV2Hash : sourceV1Hash;
        endpoint.hash = (0, hash_1.getEndpointHash)(sourceHash, envHash, secretsHash);
    }
}
//# sourceMappingURL=applyHash.js.map