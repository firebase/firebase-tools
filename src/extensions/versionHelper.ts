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
