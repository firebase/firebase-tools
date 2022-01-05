import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { getSecretVersion } from "../../gcp/secretManager";
import { logLabeledSuccess } from "../../utils";
import * as backend from "./backend";
import * as fsutils from "../../fsutils";
import * as projectPath from "../../projectPath";
import * as utils from "../../utils";

/**
 * Check that functions directory exists.
 * @param options options object. In prod is an Options; in tests can just be {cwd: string}
 * @param sourceDirName Relative path to source directory.
 * @throws { FirebaseError } Functions directory must exist.
 */
export function functionsDirectoryExists(
  options: { cwd: string; configPath?: string },
  sourceDirName: string
): void {
  // Note(inlined): What's the difference between this and options.config.path(sourceDirName)?
  if (!fsutils.dirExistsSync(projectPath.resolveProjectPath(options, sourceDirName))) {
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
export async function secretsAreValid(b: backend.Backend) {
  const endpoints = backend
    .allEndpoints(b)
    .filter((e) => e.secretEnvironmentVariables && e.secretEnvironmentVariables.length > 0);
  validatePlatformTargets(endpoints);
  await validateSecretVersions(endpoints);
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
async function validateSecretVersions(endpoints: backend.Endpoint[]) {
  const validate = async (s: backend.SecretEnvVar) => {
    const sv = await getSecretVersion(s.projectId, s.secret, s.version || "latest");
    if (s.version == null) {
      logLabeledSuccess(
        "functions",
        `resolved secret version of ${clc.bold(s.secret)} to ${clc.bold(sv.version)}.`
      );
      s.version = sv.version;
    }
    if (sv.state !== "ENABLED") {
      throw new FirebaseError(
        `Expected secret ${s.secret}@${s.version} to be in state ENABLED not ${sv.state}.`
      );
    }
  };

  const validations: Promise<void>[] = [];
  for (const e of endpoints) {
    for (const s of e.secretEnvironmentVariables! || []) {
      validations.push(validate(s));
    }
  }
  const results = await utils.allSettled(validations);

  const errs: { message: string }[] = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as utils.PromiseRejectedResult).reason as { message: string });
  if (errs.length) {
    const msg = errs.map((e) => e.message).join(", ");
    throw new FirebaseError(`Failed to validate secret versions: ${msg}`);
  }
}
