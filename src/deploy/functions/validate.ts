import * as path from "path";
import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import * as fsutils from "../../fsutils";
import * as backend from "./backend";

/** Validate that the configuration for endpoints are valid. */
export function endpointsAreValid(wantBackend: backend.Backend): void {
  functionIdsAreValid(backend.allEndpoints(wantBackend));

  // Our SDK doesn't let people articulate this, but it's theoretically possible in the manifest syntax.
  const gcfV1WithConcurrency = backend
    .allEndpoints(wantBackend)
    .filter((endpoint) => (endpoint.concurrency || 1) != 1 && endpoint.platform == "gcfv1")
    .map((endpoint) => endpoint.id);
  if (gcfV1WithConcurrency.length) {
    const msg = `Cannot set concurrency on the functions ${gcfV1WithConcurrency.join(
      ","
    )} because they are GCF gen 1`;
    throw new FirebaseError(msg);
  }

  const tooSmallForConcurrency = backend
    .allEndpoints(wantBackend)
    .filter((endpoint) => {
      if ((endpoint.concurrency || 1) == 1) {
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
