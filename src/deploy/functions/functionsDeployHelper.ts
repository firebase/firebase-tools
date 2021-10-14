import * as backend from "./backend";

export function functionMatchesAnyGroup(func: backend.TargetIds, filterGroups: string[][]) {
  if (!filterGroups.length) {
    return true;
  }
  return filterGroups.some((groupChunk) => functionMatchesGroup(func, groupChunk));
}

export function functionMatchesGroup(func: backend.TargetIds, groupChunks: string[]): boolean {
  const functionNameChunks = func.id.split("-").slice(0, groupChunks.length);
  // Should never happen. It would mean the user has asked to deploy something that is
  // a sub-function. E.g. function foo-bar and group chunks [foo, bar, baz].
  if (functionNameChunks.length != groupChunks.length) {
    return false;
  }
  for (let i = 0; i < groupChunks.length; i += 1) {
    if (groupChunks[i] !== functionNameChunks[i]) {
      return false;
    }
  }
  return true;
}

export function getFilterGroups(options: { only?: string }): string[][] {
  if (!options.only) {
    return [];
  }

  const only = options.only!.split(",");
  const onlyFunctions = only.filter((filter) => {
    const opts = filter.split(":");
    return opts[0] == "functions" && opts[1];
  });
  return onlyFunctions.map((filter) => {
    return filter.split(":")[1].split(/[.-]/);
  });
}

export function getFunctionLabel(fn: backend.TargetIds): string {
  return `${fn.id}(${fn.region})`;
}
