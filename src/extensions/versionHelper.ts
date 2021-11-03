import * as semver from "semver";

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
  return { comparator: matches.groups!.comparator, targetSemVer: matches.groups!.targetSemVer };
}

/**
 * Checks whether this version matches the comparison against the target version.
 *
 * @param semVer this version
 * @param targetSemVer target version
 * @param comparator comparator to use for the comparison
 * @returns whether this version matches the comparison against the target version
 */
export function compareVersions(semVer: string, targetSemVer: string, comparator: string): boolean {
  switch (comparator) {
    case ">=":
      return semver.gte(semVer, targetSemVer);
    case "<=":
      return semver.lte(semVer, targetSemVer);
    case ">":
      return semver.gt(semVer, targetSemVer);
    case "<":
      return semver.lt(semVer, targetSemVer);
    default:
      return semVer === targetSemVer;
  }
}
