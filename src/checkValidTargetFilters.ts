import { VALID_DEPLOY_TARGETS } from "./commands/deploy";
import { FirebaseError } from "./error";
import { Options } from "./options";

/** Returns targets from `only` only for the specified deploy types. */
function targetsForTypes(only: string[], ...types: string[]): string[] {
  return only.filter((t) => {
    if (t.includes(":")) {
      return types.includes(t.split(":")[0]);
    } else {
      return types.includes(t);
    }
  });
}

/** Returns true if any target has a filter (:). */
function targetsHaveFilters(...targets: string[]): boolean {
  return targets.some((t) => t.includes(":"));
}

/** Returns true if any target doesn't include a filter (:). */
function targetsHaveNoFilters(...targets: string[]): boolean {
  return targets.some((t) => !t.includes(":"));
}

const FILTERABLE_TARGETS = new Set(["hosting", "functions", "firestore", "storage", "database"]);

/**
 * Validates that the target filters in options.only are valid.
 * Throws an error (rejects) if it is invalid.
 */
export async function checkValidTargetFilters(options: Options): Promise<void> {
  const only = !options.only ? [] : options.only.split(",");

  return new Promise<void>((resolve, reject) => {
    if (!only.length) {
      return resolve();
    }
    if (options.except) {
      return reject(new FirebaseError("Cannot specify both --only and --except"));
    }
    const nonFilteredTypes = VALID_DEPLOY_TARGETS.filter((t) => !FILTERABLE_TARGETS.has(t));
    const targetsForNonFilteredTypes = targetsForTypes(only, ...nonFilteredTypes);
    if (targetsForNonFilteredTypes.length && targetsHaveFilters(...targetsForNonFilteredTypes)) {
      return reject(
        new FirebaseError(
          "Filters specified with colons (e.g. --only functions:func1,functions:func2) are only supported for functions, hosting, storage, and firestore",
        ),
      );
    }
    const targetsForFunctions = targetsForTypes(only, "functions");
    if (
      targetsForFunctions.length &&
      targetsHaveFilters(...targetsForFunctions) &&
      targetsHaveNoFilters(...targetsForFunctions)
    ) {
      return reject(
        new FirebaseError(
          'Cannot specify "--only functions" and "--only functions:<filter>" at the same time',
        ),
      );
    }
    return resolve();
  });
}
