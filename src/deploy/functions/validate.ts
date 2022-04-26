import * as path from "path";
import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { getSecretVersion, SecretVersion } from "../../gcp/secretManager";
import { logger } from "../../logger";
import * as fsutils from "../../fsutils";
import * as backend from "./backend";
import * as utils from "../../utils";
import * as secrets from "../../functions/secrets";
import { serviceForEndpoint } from "./services";

/** Validate that the configuration for endpoints are valid. */
export function endpointsAreValid(wantBackend: backend.Backend): void {
  const endpoints = backend.allEndpoints(wantBackend);
  functionIdsAreValid(endpoints);
  for (const ep of endpoints) {
    serviceForEndpoint(ep).validateTrigger(ep, wantBackend);
  }

  // Our SDK doesn't let people articulate this, but it's theoretically possible in the manifest syntax.
  const gcfV1WithConcurrency = endpoints
    .filter((endpoint) => (endpoint.concurrency || 1) !== 1 && endpoint.platform === "gcfv1")
    .map((endpoint) => endpoint.id);
  if (gcfV1WithConcurrency.length) {
    const msg = `Cannot set concurrency on the functions ${gcfV1WithConcurrency.join(
      ","
    )} because they are GCF gen 1`;
    throw new FirebaseError(msg);
  }

  const tooSmallForConcurrency = endpoints
    .filter((endpoint) => {
      if ((endpoint.concurrency || 1) === 1) {
        return false;
      }
      const mem = endpoint.availableMemoryMb || backend.DEFAULT_MEMORY;
      return mem < backend.MIN_MEMORY_FOR_CONCURRENCY;
    })
    .map((endpoint) => endpoint.id);
  if (tooSmallForConcurrency.length) {
    const msg = `Cannot set concurency on the functions ${tooSmallForConcurrency.join(
      ","
    )} because they have fewer than 2GB memory`;
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
    "More than one codebase claims following functions:\n\t" + `${msgs.join("\n\t")}`
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
  const v1FunctionName = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/;
  const invalidV1Ids = functions.filter((fn) => {
    return fn.platform === "gcfv1" && !v1FunctionName.test(fn.id);
  });
  if (invalidV1Ids.length !== 0) {
    const msg =
      `${invalidV1Ids.map((f) => f.id).join(", ")} function name(s) can only contain letters, ` +
      `numbers, hyphens, and not exceed 62 characters in length`;
    throw new FirebaseError(msg);
  }

  const v2FunctionName = /^[a-z][a-z0-9-]{0,62}$/;
  const invalidV2Ids = functions.filter((fn) => {
    return fn.platform === "gcfv2" && !v2FunctionName.test(fn.id);
  });
  if (invalidV2Ids.length !== 0) {
    const msg =
      `${invalidV2Ids.map((f) => f.id).join(", ")} v2 function name(s) can only contin lower ` +
      `case letters, numbers, hyphens, and not exceed 62 characters in length`;
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

/**
 * Ensures that all endpoints specifying secret environment variables target platform that supports the feature.
 */
function validatePlatformTargets(endpoints: backend.Endpoint[]) {
  const supportedPlatforms = ["gcfv1"];
  const unsupported = endpoints.filter((e) => !supportedPlatforms.includes(e.platform));
  if (unsupported.length > 0) {
    const errs = unsupported.map((e) => `${e.id}[platform=${e.platform}]`);
    throw new FirebaseError(
      `Tried to set secret environment variables on ${errs.join(", ")}. ` +
        `Only ${supportedPlatforms.join(", ")} support secret environments.`
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
    })
  );

  const secretVersions: Record<string, SecretVersion> = {};
  const errs: FirebaseError[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const sv = result.value;
      if (sv.state !== "ENABLED") {
        errs.push(
          new FirebaseError(
            `Expected secret ${sv.secret.name}@${sv.versionId} to be in state ENABLED not ${sv.state}.`
          )
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
        "Secret version is unexpectedly undefined. This should never happen."
      );
    }
  }
}
