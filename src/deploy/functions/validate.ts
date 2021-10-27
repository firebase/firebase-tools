import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { getFunctionLabel } from "./functionsDeployHelper";
import * as backend from "./backend";
import * as fsutils from "../../fsutils";
import * as projectPath from "../../projectPath";

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
