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
exports.secretsAreValid = exports.functionIdsAreValid = exports.functionsDirectoryExists = exports.endpointsAreUnique = exports.cpuConfigIsValid = exports.endpointsAreValid = void 0;
const path = __importStar(require("path"));
const clc = __importStar(require("colorette"));
const error_1 = require("../../error");
const secretManager_1 = require("../../gcp/secretManager");
const logger_1 = require("../../logger");
const fsutils = __importStar(require("../../fsutils"));
const backend = __importStar(require("./backend"));
const utils = __importStar(require("../../utils"));
const secrets = __importStar(require("../../functions/secrets"));
const services_1 = require("./services");
function matchingIds(endpoints, filter) {
    return endpoints
        .filter(filter)
        .map((endpoint) => endpoint.id)
        .join(",");
}
const mem = (endpoint) => endpoint.availableMemoryMb || backend.DEFAULT_MEMORY;
const cpu = (endpoint) => {
    return endpoint.cpu === "gcf_gen1"
        ? backend.memoryToGen1Cpu(mem(endpoint))
        : endpoint.cpu ?? backend.memoryToGen2Cpu(mem(endpoint));
};
/** Validate that the configuration for endpoints are valid. */
function endpointsAreValid(wantBackend) {
    const endpoints = backend.allEndpoints(wantBackend);
    functionIdsAreValid(endpoints);
    for (const ep of endpoints) {
        (0, services_1.serviceForEndpoint)(ep).validateTrigger(ep, wantBackend);
    }
    // Our SDK doesn't let people articulate this, but it's theoretically possible in the manifest syntax.
    const gcfV1WithConcurrency = matchingIds(endpoints, (endpoint) => (endpoint.concurrency || 1) !== 1 && endpoint.platform === "gcfv1");
    if (gcfV1WithConcurrency.length) {
        const msg = `Cannot set concurrency on the functions ${gcfV1WithConcurrency} because they are GCF gen 1`;
        throw new error_1.FirebaseError(msg);
    }
    const tooSmallForConcurrency = matchingIds(endpoints, (endpoint) => {
        if ((endpoint.concurrency || 1) === 1) {
            return false;
        }
        return cpu(endpoint) < backend.MIN_CPU_FOR_CONCURRENCY;
    });
    if (tooSmallForConcurrency.length) {
        const msg = "The following functions are configured to allow concurrent " +
            "execution and less than one full CPU. This is not supported: " +
            tooSmallForConcurrency;
        throw new error_1.FirebaseError(msg);
    }
    cpuConfigIsValid(endpoints);
}
exports.endpointsAreValid = endpointsAreValid;
/**
 *  Validate that endpoints have valid CPU configuration.
 *  Enforces https://cloud.google.com/run/docs/configuring/cpu.
 */
function cpuConfigIsValid(endpoints) {
    const gcfV1WithCPU = matchingIds(endpoints, (endpoint) => endpoint.platform === "gcfv1" && typeof endpoint["cpu"] !== "undefined");
    if (gcfV1WithCPU.length) {
        const msg = `Cannot set CPU on the functions ${gcfV1WithCPU} because they are GCF gen 1`;
        throw new error_1.FirebaseError(msg);
    }
    const invalidCPU = matchingIds(endpoints, (endpoint) => {
        const c = cpu(endpoint);
        if (c < 0.08) {
            return true;
        }
        if (c < 1) {
            return false;
        }
        // But whole CPU is limited to fixed sizes
        return ![1, 2, 4, 6, 8].includes(c);
    });
    if (invalidCPU.length) {
        const msg = `The following functions have invalid CPU settings ${invalidCPU}. Valid CPU options are (0.08, 1], 2, 4, 6, 8, or "gcf_gen1"`;
        throw new error_1.FirebaseError(msg);
    }
    const smallCPURegions = ["australia-southeast2", "asia-northeast3", "asia-south2"];
    const tooBigCPUForRegion = matchingIds(endpoints, (endpoint) => smallCPURegions.includes(endpoint.region) && cpu(endpoint) > 4);
    if (tooBigCPUForRegion) {
        const msg = `The functions ${tooBigCPUForRegion} have > 4 CPU in a region that supports a maximum 4 CPU`;
        throw new error_1.FirebaseError(msg);
    }
    const tooSmallCPUSmall = matchingIds(endpoints, (endpoint) => mem(endpoint) > 512 && cpu(endpoint) < 0.5);
    if (tooSmallCPUSmall) {
        const msg = `The functions ${tooSmallCPUSmall} have too little CPU for their memory allocation. A minimum of 0.5 CPU is needed to set a memory limit greater than 512MiB`;
        throw new error_1.FirebaseError(msg);
    }
    const tooSmallCPUBig = matchingIds(endpoints, (endpoint) => mem(endpoint) > 1024 && cpu(endpoint) < 1);
    if (tooSmallCPUBig) {
        const msg = `The functions ${tooSmallCPUSmall} have too little CPU for their memory allocation. A minimum of 1 CPU is needed to set a memory limit greater than 1GiB`;
        throw new error_1.FirebaseError(msg);
    }
    const tooSmallMemory4CPU = matchingIds(endpoints, (endpoint) => cpu(endpoint) === 4 && mem(endpoint) < 2 << 10);
    if (tooSmallMemory4CPU) {
        const msg = `The functions ${tooSmallMemory4CPU} have too little memory for their CPU. Functions with 4 CPU require at least 2GiB`;
        throw new error_1.FirebaseError(msg);
    }
    const tooSmallMemory6CPU = matchingIds(endpoints, (endpoint) => cpu(endpoint) === 6 && mem(endpoint) < 3 << 10);
    if (tooSmallMemory6CPU) {
        const msg = `The functions ${tooSmallMemory6CPU} have too little memory for their CPU. Functions with 6 CPU require at least 3GiB`;
        throw new error_1.FirebaseError(msg);
    }
    const tooSmallMemory8CPU = matchingIds(endpoints, (endpoint) => cpu(endpoint) === 8 && mem(endpoint) < 4 << 10);
    if (tooSmallMemory8CPU) {
        const msg = `The functions ${tooSmallMemory8CPU} have too little memory for their CPU. Functions with 8 CPU require at least 4GiB`;
        throw new error_1.FirebaseError(msg);
    }
}
exports.cpuConfigIsValid = cpuConfigIsValid;
/** Validate that all endpoints in the given set of backends are unique */
function endpointsAreUnique(backends) {
    const endpointToCodebases = {}; // function name -> codebases
    for (const [codebase, b] of Object.entries(backends)) {
        for (const endpoint of backend.allEndpoints(b)) {
            const key = backend.functionName(endpoint);
            const cs = endpointToCodebases[key] || new Set();
            cs.add(codebase);
            endpointToCodebases[key] = cs;
        }
    }
    const conflicts = {};
    for (const [fn, codebases] of Object.entries(endpointToCodebases)) {
        if (codebases.size > 1) {
            conflicts[fn] = Array.from(codebases);
        }
    }
    if (Object.keys(conflicts).length === 0) {
        return;
    }
    const msgs = Object.entries(conflicts).map(([fn, codebases]) => `${fn}: ${codebases.join(",")}`);
    throw new error_1.FirebaseError("More than one codebase claims following functions:\n\t" + `${msgs.join("\n\t")}`);
}
exports.endpointsAreUnique = endpointsAreUnique;
/**
 * Check that functions directory exists.
 * @param sourceDir Absolute path to source directory.
 * @param projectDir Absolute path to project directory.
 * @throws { FirebaseError } Functions directory must exist.
 */
function functionsDirectoryExists(sourceDir, projectDir) {
    if (!fsutils.dirExistsSync(sourceDir)) {
        const sourceDirName = path.relative(projectDir, sourceDir);
        const msg = `could not deploy functions because the ${clc.bold('"' + sourceDirName + '"')} ` +
            `directory was not found. Please create it or specify a different source directory in firebase.json`;
        throw new error_1.FirebaseError(msg);
    }
}
exports.functionsDirectoryExists = functionsDirectoryExists;
/**
 * Validate function names only contain letters, numbers, underscores, and hyphens
 * and not exceed 63 characters in length.
 * @param functionNames Object containing function names as keys.
 * @throws { FirebaseError } Function names must be valid.
 */
function functionIdsAreValid(functions) {
    // TODO: cannot end with a _ or -
    const functionName = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/;
    const invalidIds = functions.filter((fn) => !functionName.test(fn.id));
    if (invalidIds.length !== 0) {
        const msg = `${invalidIds.map((f) => f.id).join(", ")} function name(s) can only contain letters, ` +
            `numbers, hyphens, and not exceed 62 characters in length`;
        throw new error_1.FirebaseError(msg);
    }
}
exports.functionIdsAreValid = functionIdsAreValid;
/**
 * Validate secret environment variables setting, if any.
 * A bad secret configuration can lead to a significant delay in function deploys.
 *
 * If validation fails for any secret config, throws a FirebaseError.
 */
async function secretsAreValid(projectId, wantBackend) {
    const endpoints = backend
        .allEndpoints(wantBackend)
        .filter((e) => e.secretEnvironmentVariables && e.secretEnvironmentVariables.length > 0);
    validatePlatformTargets(endpoints);
    await validateSecretVersions(projectId, endpoints);
}
exports.secretsAreValid = secretsAreValid;
const secretsSupportedPlatforms = ["gcfv1", "gcfv2"];
/**
 * Ensures that all endpoints specifying secret environment variables target platform that supports the feature.
 */
function validatePlatformTargets(endpoints) {
    const unsupported = endpoints.filter((e) => !secretsSupportedPlatforms.includes(e.platform));
    if (unsupported.length > 0) {
        const errs = unsupported.map((e) => `${e.id}[platform=${e.platform}]`);
        throw new error_1.FirebaseError(`Tried to set secret environment variables on ${errs.join(", ")}. ` +
            `Only ${secretsSupportedPlatforms.join(", ")} support secret environments.`);
    }
}
/**
 * Validate each secret version referenced in target endpoints.
 *
 * A secret version is valid if:
 *   1) It exists.
 *   2) It's in state "enabled".
 */
async function validateSecretVersions(projectId, endpoints) {
    const toResolve = new Set();
    for (const s of secrets.of(endpoints)) {
        toResolve.add(s.secret);
    }
    const results = await utils.allSettled(Array.from(toResolve).map(async (secret) => {
        // We resolve the secret to its latest version - we do not allow CF3 customers to pin secret versions.
        const sv = await (0, secretManager_1.getSecretVersion)(projectId, secret, "latest");
        logger_1.logger.debug(`Resolved secret version of ${clc.bold(secret)} to ${clc.bold(sv.versionId)}.`);
        return sv;
    }));
    const secretVersions = {};
    const errs = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            const sv = result.value;
            if (sv.state !== "ENABLED") {
                errs.push(new error_1.FirebaseError(`Expected secret ${sv.secret.name}@${sv.versionId} to be in state ENABLED not ${sv.state}.`));
            }
            secretVersions[sv.secret.name] = sv;
        }
        else {
            errs.push(new error_1.FirebaseError(result.reason.message));
        }
    }
    if (errs.length) {
        throw new error_1.FirebaseError("Failed to validate secret versions", { children: errs });
    }
    // Fill in versions.
    for (const s of secrets.of(endpoints)) {
        s.version = secretVersions[s.secret].versionId;
        if (!s.version) {
            throw new error_1.FirebaseError("Secret version is unexpectedly undefined. This should never happen.");
        }
    }
}
//# sourceMappingURL=validate.js.map