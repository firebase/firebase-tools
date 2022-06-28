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

import { FirebaseError } from "../error";

export interface VersionPredicate {
  comparator: string;
  targetSemVer: string;
}

/**
 * Converts the string version predicate into a parsed object.
 *
 * @param versionPredicate a combined comparator and semver (e.g. ">=1.0.1")
 * @returns the parsed version predicate
 */
export function parseVersionPredicate(versionPredicate: string): VersionPredicate {
  const versionPredicateRegex = "^(?<comparator>>=|<=|>|<)?(?<targetSemVer>.*)";
  const matches = versionPredicate.match(versionPredicateRegex);
  if (!matches || !matches.groups!.targetSemVer) {
    throw new FirebaseError("Invalid version predicate.");
  }
  const comparator = matches.groups!.comparator || "=";
  return { comparator, targetSemVer: matches.groups!.targetSemVer };
}
