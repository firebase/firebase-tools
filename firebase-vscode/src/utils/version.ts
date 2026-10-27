import * as semver from "semver";

/**
 * Extracts a valid semantic version string from command output (e.g. `firebase --version` or `npm --version`).
 *
 * Handles single-line versions as well as multi-line output containing leading debug logs,
 * timestamped headers, or login-shell banners.
 */
export function parseVersion(stdout: string): string | undefined {
  if (!stdout) {
    return undefined;
  }
  const lines = stdout
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Pass 1: Scan bottom-to-top for a standalone valid semver line (standard output from firebase/npm)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const valid = semver.valid(line) || semver.valid(semver.clean(line));
    if (valid) {
      return valid;
    }
  }

  // Pass 2: Fallback scanning bottom-to-top, ignoring timestamped log lines
  const semverTokenRegex =
    /\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Skip timestamped debug/log lines like [2026-10-27T16:10:13.531Z]
    if (/^\[\d{4}-\d{2}-\d{2}T/.test(line)) {
      continue;
    }
    const match = line.match(semverTokenRegex);
    if (match) {
      const valid =
        semver.valid(match[1]) || semver.valid(semver.clean(match[1]));
      if (valid) {
        return valid;
      }
    }
  }

  return undefined;
}
