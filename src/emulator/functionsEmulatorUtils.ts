/**
 * Please be careful when adding require/imports to this file, it is pulled into functionsEmulatorRuntime
 * which is ran in a separate node process, so it is likely to have unintended side-effects for you.
 *
 * TODO(samstern): Merge this with functionsEmulatorShared
 * TODO(samstern): Audit dependencies of functionsEmulatorShared
 */

const wildcardRegex = new RegExp("{[^/{}]*}");
const wildcardKeyRegex = new RegExp("^{(.+)}$");

export interface ModuleVersion {
  major: number;
  minor: number;
  patch: number;
}

export function extractParamsFromPath(
  wildcardPath: string,
  snapshotPath: string,
): { [key: string]: string } {
  if (!isValidWildcardMatch(wildcardPath, snapshotPath)) {
    return {};
  }

  const wildcardChunks = trimSlashes(wildcardPath).split("/");
  const snapshotChunks = trimSlashes(snapshotPath).split("/");
  return wildcardChunks
    .slice(-snapshotChunks.length)
    .reduce((params: { [key: string]: string }, chunk, index) => {
      const match = wildcardKeyRegex.exec(chunk);
      if (match) {
        const wildcardKey = match[1];
        const potentialWildcardValue = snapshotChunks[index];
        if (!wildcardKeyRegex.exec(potentialWildcardValue)) {
          params[wildcardKey] = potentialWildcardValue;
        }
      }
      return params;
    }, {});
}

export function isValidWildcardMatch(wildcardPath: string, snapshotPath: string): boolean {
  const wildcardChunks = trimSlashes(wildcardPath).split("/");
  const snapshotChunks = trimSlashes(snapshotPath).split("/");

  if (snapshotChunks.length > wildcardChunks.length) {
    return false;
  }

  const mismatchedChunks = wildcardChunks.slice(-snapshotChunks.length).filter((chunk, index) => {
    return !(wildcardRegex.exec(chunk) || chunk === snapshotChunks[index]);
  });

  return mismatchedChunks.length === 0;
}

export function trimSlashes(str: string): string {
  // Removes slashes at the start of the string, end of the string,
  // and any repeated slashes.
  //
  // Ex: trimSlashes("/a//b/") === "a/b"
  return str
    .split("/")
    .filter((c) => c)
    .join("/");
}

export function removePathSegments(path: string, count: number): string {
  return trimSlashes(path).split("/").slice(count).join("/");
}

/**
 * Parse a runtime string like "nodejs10" or "10" into a single number.
 * Returns undefined if the string does not match the expected pattern.
 */
export function parseRuntimeVersion(runtime?: string): number | undefined {
  if (!runtime) {
    return undefined;
  }

  const runtimeRe = /(nodejs)?([0-9]+)/;
  const match = runtimeRe.exec(runtime);
  if (match) {
    return Number.parseInt(match[2]);
  }

  return undefined;
}

/**
 * Parse a semver version string into parts, filling in 0s where empty.
 */
export function parseVersionString(version?: string): ModuleVersion {
  const parts = (version || "0").split(".");

  // Make sure "parts" always has 3 elements. Extras are ignored.
  parts.push("0");
  parts.push("0");

  return {
    major: parseInt(parts[0], 10),
    minor: parseInt(parts[1], 10),
    patch: parseInt(parts[2], 10),
  };
}

/**
 * Compare two SemVer version strings.
 *
 * Returns:
 *   - Positive number if a is greater.
 *   - Negative number if b is greater.
 *   - Zero if they are the same.
 */
export function compareVersionStrings(a?: string, b?: string) {
  const versionA = parseVersionString(a);
  const versionB = parseVersionString(b);

  if (versionA.major !== versionB.major) {
    return versionA.major - versionB.major;
  }

  if (versionA.minor !== versionB.minor) {
    return versionA.minor - versionB.minor;
  }

  if (versionA.patch !== versionB.patch) {
    return versionA.patch - versionB.patch;
  }

  return 0;
}

/**
 * Check if a url is localhost
 */
export function isLocalHost(href: string): boolean {
  return !!href.match(/^(http(s)?:\/\/)?(localhost|127.0.0.1|\[::1])/);
}
