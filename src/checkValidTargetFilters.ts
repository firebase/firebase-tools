import * as _ from "lodash";

import { FirebaseError } from "./error";
import { Options } from "./options";

export function checkValidTargetFilters(options: Options): Promise<void> {
  function numFilters(targetTypes: string[]): number {
    return _.filter(options.only, (opt) => {
      const optChunks = opt.split(":");
      return targetTypes.includes(optChunks[0]) && optChunks.length > 1;
    }).length;
  }
  function targetContainsFilter(targetTypes: string[]): boolean {
    return numFilters(targetTypes) > 1;
  }
  function targetDoesNotContainFilter(targetTypes: string[]): boolean {
    return numFilters(targetTypes) === 0;
  }

  return new Promise<void>((resolve, reject) => {
    if (!options.only) {
      return resolve();
    }
    if (options.except) {
      return reject(new FirebaseError("Cannot specify both --only and --except"));
    }
    if (targetContainsFilter(["database", "storage", "hosting"])) {
      return reject(
        new FirebaseError(
          "Filters specified with colons (e.g. --only functions:func1,functions:func2) are only supported for functions"
        )
      );
    }
    if (targetContainsFilter(["functions"]) && targetDoesNotContainFilter(["functions"])) {
      return reject(
        new FirebaseError(
          'Cannot specify "--only functions" and "--only functions:<filter>" at the same time'
        )
      );
    }
    return resolve();
  });
}
