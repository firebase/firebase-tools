import { intersection, difference } from "lodash";
import { FirebaseError } from "./error";
import { Options } from "./options";

/**
 * Filters targets from options with valid targets as specified.
 * @param options CLI options.
 * @param validTargets Targets that are valid.
 * @return List of targets as specified and filtered by options and validTargets.
 */
export function filterTargets(options: Options, validTargets: string[]): string[] {
  let targets = validTargets.filter((t) => {
    return options.config.has(t);
  });
  if (options.only) {
    targets = intersection(
      targets,
      options.only.split(",").map((opt: string) => {
        return opt.split(":")[0];
      }),
    );
  } else if (options.except) {
    targets = difference(targets, options.except.split(","));
  }
  if (targets.length === 0) {
    let msg = "Cannot understand what targets to deploy/serve.";

    if (options.only) {
      msg += ` No targets in firebase.json match '--only ${options.only}'.`;
    } else if (options.except) {
      msg += ` No targets in firebase.json match '--except ${options.except}'.`;
    }

    if (process.platform === "win32") {
      msg +=
        ' If you are using PowerShell make sure you place quotes around any comma-separated lists (ex: --only "functions,firestore").';
    }

    throw new FirebaseError(msg);
  }
  return targets;
}
