/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

/**
 * Validates that the target filters in options.only are valid.
 * Throws an error (rejects) if it is invalid.
 */
export async function checkValidTargetFilters(options: Options): Promise<void> {
  const only = (options.only || "").split(",");

  return new Promise<void>((resolve, reject) => {
    if (!only.length) {
      return resolve();
    }
    if (options.except) {
      return reject(new FirebaseError("Cannot specify both --only and --except"));
    }
    const nonFilteredTypes = VALID_DEPLOY_TARGETS.filter(
      (t) => !["hosting", "functions"].includes(t)
    );
    const targetsForNonFilteredTypes = targetsForTypes(only, ...nonFilteredTypes);
    if (targetsForNonFilteredTypes.length && targetsHaveFilters(...targetsForNonFilteredTypes)) {
      return reject(
        new FirebaseError(
          "Filters specified with colons (e.g. --only functions:func1,functions:func2) are only supported for functions and hosting"
        )
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
          'Cannot specify "--only functions" and "--only functions:<filter>" at the same time'
        )
      );
    }
    return resolve();
  });
}
