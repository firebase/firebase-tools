import * as path from "path";
import * as clc from "colorette";

import { FirebaseError } from "../../error";
import { getSecretVersion, SecretVersion } from "../../gcp/secretManager";
import { logger } from "../../logger";
import * as fsutils from "../../fsutils";
import * as backend from "./backend";
import * as utils from "../../utils";
import * as secrets from "../../functions/secrets";
import { serviceForEndpoint } from "./services";

function matchingIds(
  endpoints: backend.Endpoint[],
  filter: (endpoint: backend.Endpoint) => boolean,
): string {
  return endpoints
    .filter(filter)
    .map((endpoint) => endpoint.id)
    .join(",");
}

const mem = (endpoint: backend.Endpoint): backend.MemoryOptions =>
  endpoint.availableMemoryMb || backend.DEFAULT_MEMORY;
const cpu = (endpoint: backend.Endpoint): number => {
  return endpoint.cpu === "gcf_gen1"
    ? backend.memoryToGen1Cpu(mem(endpoint))
    : endpoint.cpu ?? backend.memoryToGen2Cpu(mem(endpoint));
};

/** Validate that the configuration for endpoints are valid. */
export function endpointsAreValid(wantBackend: backend.Backend): void {
  const endpoints = backend.allEndpoints(wantBackend);
  functionIdsAreValid(endpoints);
  for (const ep of endpoints) {
    serviceForEndpoint(ep).validateTrigger(ep, wantBackend);
  }

  // Our SDK doesn't let people articulate this, but it's theoretically possible in the manifest syntax.
  const gcfV1WithConcurrency = matchingIds(
    endpoints,
    (endpoint) => (endpoint.concurrency || 1) !== 1 && endpoint.platform === "gcfv1",
  );
  if (gcfV1WithConcurrency.length) {
    const msg = `Cannot set concurrency on the functions ${gcfV1WithConcurrency} because they are GCF gen 1`;
    throw new FirebaseError(msg);
  }

  const tooSmallForConcurrency = matchingIds(endpoints, (endpoint) => {
    if ((endpoint.concurrency || 1) === 1) {
      return false;
    }
    return cpu(endpoint) < backend.MIN_CPU_FOR_CONCURRENCY;
  });
  if (tooSmallForConcurrency.length) {
    const msg =
      "The following functions are configured to allow concurrent " +
      "execution and less than one full CPU. This is not supported: " +
      tooSmallForConcurrency;
    throw new FirebaseError(msg);
  }
  cpuConfigIsValid(endpoints);
}

/**
 *  Validate that endpoints have valid CPU configuration.
 *  Enforces https://cloud.google.com/run/docs/configuring/cpu.
 */
export function cpuConfigIsValid(endpoints: backend.Endpoint[]): void {
  const gcfV1WithCPU = matchingIds(
    endpoints,
    (endpoint) => endpoint.platform === "gcfv1" && typeof endpoint["cpu"] !== "undefined",
  );
  if (gcfV1WithCPU.length) {
    const msg = `Cannot set CPU on the functions ${gcfV1WithCPU} because they are GCF gen 1`;
    throw new FirebaseError(msg);
  }

  const invalidCPU = matchingIds(endpoints, (endpoint) => {
    const c: number = cpu(endpoint);
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
    throw new FirebaseError(msg);
  }

  const smallCPURegions = ["australia-southeast2", "asia-northeast3", "asia-south2"];
  const tooBigCPUForRegion = matchingIds(
    endpoints,
    (endpoint) => smallCPURegions.includes(endpoint.region) && cpu(endpoint) > 4,
  );
  if (tooBigCPUForRegion) {
    const msg = `The functions ${tooBigCPUForRegion} have > 4 CPU in a region that supports a maximum 4 CPU`;
    throw new FirebaseError(msg);
  }

  const tooSmallCPUSmall = matchingIds(
    endpoints,
    (endpoint) => mem(endpoint) > 512 && cpu(endpoint) < 0.5,
  );
  if (tooSmallCPUSmall) {
    const msg = `The functions ${tooSmallCPUSmall} have too little CPU for their memory allocation. A minimum of 0.5 CPU is needed to set a memory limit greater than 512MiB`;
    throw new FirebaseError(msg);
  }

  const tooSmallCPUBig = matchingIds(
    endpoints,
    (endpoint) => mem(endpoint) > 1024 && cpu(endpoint) < 1,
  );
  if (tooSmallCPUBig) {
    const msg = `The functions ${tooSmallCPUSmall} have too little CPU for their memory allocation. A minimum of 1 CPU is needed to set a memory limit greater than 1GiB`;
    throw new FirebaseError(msg);
  }
  const tooSmallMemory4CPU = matchingIds(
    endpoints,
    (endpoint) => cpu(endpoint) === 4 && mem(endpoint) < 2 << 10,
  );
  if (tooSmallMemory4CPU) {
    const msg = `The functions ${tooSmallMemory4CPU} have too little memory for their CPU. Functions with 4 CPU require at least 2GiB`;
    throw new FirebaseError(msg);
  }
  const tooSmallMemory6CPU = matchingIds(
    endpoints,
    (endpoint) => cpu(endpoint) === 6 && mem(endpoint) < 3 << 10,
  );
  if (tooSmallMemory6CPU) {
    const msg = `The functions ${tooSmallMemory6CPU} have too little memory for their CPU. Functions with 6 CPU require at least 3GiB`;
    throw new FirebaseError(msg);
  }
  const tooSmallMemory8CPU = matchingIds(
    endpoints,
    (endpoint) => cpu(endpoint) === 8 && mem(endpoint) < 4 << 10,
  );
  if (tooSmallMemory8CPU) {
    const msg = `The functions ${tooSmallMemory8CPU} have too little memory for their CPU. Functions with 8 CPU require at least 4GiB`;
    throw new FirebaseError(msg);
  }
}

/** Validate that all endpoints in the given set of backends are unique */
export function endpointsAreUnique(backends: Record<string, backend.Backend>): void {
  const endpointToCodebases: Record<string, Set<string>> = {}; // function name -> codebases

  for (const [codebase, b] of Object.entries(backends)) {
    for (const endpoint of backend.allEndpoints(b)) {
      const key = backend.functionName(endpoint);
      const cs = endpointToCodebases[key] || new Set();
      cs.add(codebase);
      endpointToCodebases[key] = cs;
    }
  }

  const conflicts: Record<string, string[]> = {};
  for (const [fn, codebases] of Object.entries(endpointToCodebases)) {
    if (codebases.size > 1) {
      conflicts[fn] = Array.from(codebases);
    }
  }

  if (Object.keys(conflicts).length === 0) {
    return;
  }

  const msgs = Object.entries(conflicts).map(([fn, codebases]) => `${fn}: ${codebases.join(",")}`);
  throw new FirebaseError(
    "More than one codebase claims following functions:\n\t" + `${msgs.join("\n\t")}`,
  );
}

/**
 * Check that functions directory exists.
 * @param sourceDir Absolute path to source directory.
 * @param projectDir Absolute path to project directory.
 * @throws { FirebaseError } Functions directory must exist.
 */
export function functionsDirectoryExists(sourceDir: string, projectDir: string): void {
  if (!fsutils.dirExistsSync(sourceDir)) {
    const sourceDirName = path.relative(projectDir, sourceDir);
    const msg =
      `could not deploy functions because the ${clc.bold('"' + sourceDirName + '"')} ` +
      `directory was not found. Please create it or specify a different source directory in firebase.json`;
    throw new FirebaseError(msg);
  }
}

/**
 * Validate function names only contain letters, numbers, underscores, and hyphens
 * and not exceed 63 characters in length.
 * @param functionNames Object containing function names as keys.
 * @throws { FirebaseError } Function names must be valid.
 */
export function functionIdsAreValid(functions: { id: string; platform: string }[]): void {
  // TODO: cannot end with a _ or -
  const functionName = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/;
  const invalidIds = functions.filter((fn) => !functionName.test(fn.id));
  if (invalidIds.length !== 0) {
    const msg =
      `${invalidIds.map((f) => f.id).join(", ")} function name(s) can only contain letters, ` +
      `numbers, hyphens, and not exceed 62 characters in length`;
    throw new FirebaseError(msg);
  }
}

/**
 * Validate secret environment variables setting, if any.
 * A bad secret configuration can lead to a significant delay in function deploys.
 *
 * If validation fails for any secret config, throws a FirebaseError.
 */
export async function secretsAreValid(projectId: string, wantBackend: backend.Backend) {
  const endpoints = backend
    .allEndpoints(wantBackend)
    .filter((e) => e.secretEnvironmentVariables && e.secretEnvironmentVariables.length > 0);
  validatePlatformTargets(endpoints);
  await validateSecretVersions(projectId, endpoints);
}

const secretsSupportedPlatforms = ["gcfv1", "gcfv2"];
/**
 * Ensures that all endpoints specifying secret environment variables target platform that supports the feature.
 */
function validatePlatformTargets(endpoints: backend.Endpoint[]) {
  const unsupported = endpoints.filter((e) => !secretsSupportedPlatforms.includes(e.platform));
  if (unsupported.length > 0) {
    const errs = unsupported.map((e) => `${e.id}[platform=${e.platform}]`);
    throw new FirebaseError(
      `Tried to set secret environment variables on ${errs.join(", ")}. ` +
        `Only ${secretsSupportedPlatforms.join(", ")} support secret environments.`,
    );
  }
}

/**
 * Validate each secret version referenced in target endpoints.
 *
 * A secret version is valid if:
 *   1) It exists.
 *   2) It's in state "enabled".
 */
async function validateSecretVersions(projectId: string, endpoints: backend.Endpoint[]) {
  const toResolve: Set<string> = new Set();
  for (const s of secrets.of(endpoints)) {
    toResolve.add(s.secret);
  }

  const results = await utils.allSettled(
    Array.from(toResolve).map(async (secret): Promise<SecretVersion> => {
      // We resolve the secret to its latest version - we do not allow CF3 customers to pin secret versions.
      const sv = await getSecretVersion(projectId, secret, "latest");
      logger.debug(`Resolved secret version of ${clc.bold(secret)} to ${clc.bold(sv.versionId)}.`);
      return sv;
    }),
  );

  const secretVersions: Record<string, SecretVersion> = {};
  const errs: FirebaseError[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const sv = result.value;
      if (sv.state !== "ENABLED") {
        errs.push(
          new FirebaseError(
            `Expected secret ${sv.secret.name}@${sv.versionId} to be in state ENABLED not ${sv.state}.`,
          ),
        );
      }
      secretVersions[sv.secret.name] = sv;
    } else {
      errs.push(new FirebaseError((result.reason as { message: string }).message));
    }
  }

  if (errs.length) {
    throw new FirebaseError("Failed to validate secret versions", { children: errs });
  }

  // Fill in versions.
  for (const s of secrets.of(endpoints)) {
    s.version = secretVersions[s.secret].versionId;
    if (!s.version) {
      throw new FirebaseError(
        "Secret version is unexpectedly undefined. This should never happen.",
      );
    }
  }
}
