/*
Please be careful when adding require/imports to this file, it is pulled into functionsEmulatorRuntime
which is ran in a separate node process, so it is likely to have unintended side-effects for you.
 */

const wildcardRegex = new RegExp("{[^/{}]*}");
const wildcardKeyRegex = new RegExp("^{(.+)}$");

export function extractParamsFromPath(
  wildcardPath: string,
  snapshotPath: string
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
  return trimSlashes(path)
    .split("/")
    .slice(count)
    .join("/");
}
