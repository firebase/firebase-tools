import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { getFunctionLabel } from "./functionsDeployHelper";
import * as backend from "./backend";
import * as fsutils from "../../fsutils";
import * as projectPath from "../../projectPath";

// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

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
 * and not exceed 62 characters in length.
 * @param functionNames Object containing function names as keys.
 * @throws { FirebaseError } Function names must be valid.
 */
export function functionIdsAreValid(functions: { id: string }[]): void {
  const validFunctionNameRegex = /^[a-zA-Z0-9_-]{1,62}$/;
  const invalidIds = functions.filter((fn) => !validFunctionNameRegex.test(fn.id));
  if (invalidIds.length !== 0) {
    const msg =
      `${invalidIds.join(", ")} function name(s) can only contain letters, ` +
      `numbers, hyphens, and not exceed 62 characters in length`;
    throw new FirebaseError(msg);
  }
}

export function checkForInvalidChangeOfTrigger(
  fn: backend.FunctionSpec,
  exFn: backend.FunctionSpec
) {
  const wantEventTrigger = backend.isEventTrigger(fn.trigger);
  const haveEventTrigger = backend.isEventTrigger(exFn.trigger);
  if (!wantEventTrigger && haveEventTrigger) {
    throw new FirebaseError(
      `[${getFunctionLabel(
        fn
      )}] Changing from a background triggered function to an HTTPS function is not allowed. Please delete your function and create a new one instead.`
    );
  }
  if (wantEventTrigger && !haveEventTrigger) {
    throw new FirebaseError(
      `[${getFunctionLabel(
        fn
      )}] Changing from an HTTPS function to an background triggered function is not allowed. Please delete your function and create a new one instead.`
    );
  }
  if (fn.apiVersion == 2 && exFn.apiVersion == 1) {
    throw new FirebaseError(
      `[${getFunctionLabel(
        fn
      )}] Upgrading from GCFv1 to GCFv2 is not yet supported. Please delete your old function or wait for this feature to be ready.`
    );
  }
  if (fn.apiVersion == 1 && exFn.apiVersion == 2) {
    throw new FirebaseError(
      `[${getFunctionLabel(fn)}] Functions cannot be downgraded from GCFv2 to GCFv1`
    );
  }
  if (exFn.labels?.["deployment-scheduled"] && !fn.labels?.["deployment-scheduled"]) {
    throw new FirebaseError(
      `[${getFunctionLabel(
        fn
      )}] Scheduled functions cannot be changed to event handler or HTTP functions`
    );
  }
}
