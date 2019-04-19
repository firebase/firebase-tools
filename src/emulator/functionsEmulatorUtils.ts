const wildcardRegex = new RegExp("{[^/{}]*}");
export function _extractParamsFromPath(wildcardPath: string, snapshotPath: string): any {
  if (!_isValidWildcardMatch(wildcardPath, snapshotPath)) {
    return {};
  }

  const wildcardKeyRegex = /^{(.+)}$/;
  const wildcardChunks = _trimSlashes(wildcardPath).split("/");
  const snapshotChucks = _trimSlashes(snapshotPath).split("/");
  return wildcardChunks
    .slice(-snapshotChucks.length)
    .reduce((params: { [key: string]: string }, chunk, index) => {
      const match = wildcardKeyRegex.exec(chunk);
      if (match) {
        const wildcardKey = match[1];
        const potentialWildcardValue = snapshotChucks[index];
        if (!wildcardKeyRegex.exec(potentialWildcardValue)) {
          params[wildcardKey] = potentialWildcardValue;
        }
      }
      return params;
    }, {});
}

function _isValidWildcardMatch(wildcardPath: string, snapshotPath: string): boolean {
  const wildcardChunks = _trimSlashes(wildcardPath).split("/");
  const snapshotChucks = _trimSlashes(snapshotPath).split("/");

  if (snapshotChucks.length > wildcardChunks.length) {
    return false;
  }

  const mismatchedChunks = wildcardChunks.slice(-snapshotChucks.length).filter((chunk, index) => {
    return !(wildcardRegex.exec(chunk) || chunk === snapshotChucks[index]);
  });

  return !mismatchedChunks.length;
}

export function _trimSlashes(str: string): string {
  return str
    .split("/")
    .filter((c) => c)
    .join("/");
}
