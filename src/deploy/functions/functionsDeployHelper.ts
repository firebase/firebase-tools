import * as backend from "./backend";
import * as projectConfig from "../../functions/projectConfig";

export interface FunctionFilter {
  codebase: string;
  idChunks: string[];
}

/**
 *
 */
export function functionMatchesAnyGroup(func: backend.TargetIds, filterGroups: string[][]) {
  if (!filterGroups.length) {
    return true;
  }
  return filterGroups.some((groupChunk) => functionMatchesGroup(func, groupChunk));
}

/**
 *
 */
export function functionMatchesGroup(func: backend.TargetIds, groupChunks: string[]): boolean {
  const functionNameChunks = func.id.split("-").slice(0, groupChunks.length);
  // Should never happen. It would mean the user has asked to deploy something that is
  // a sub-function. E.g. function foo-bar and group chunks [foo, bar, baz].
  if (functionNameChunks.length !== groupChunks.length) {
    return false;
  }
  for (let i = 0; i < groupChunks.length; i += 1) {
    if (groupChunks[i] !== functionNameChunks[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Todo: Add doc on how resource selector works
 * @param options
 */
export function getFunctionFilters(options: { only?: string }): FunctionFilter[] {
  if (!options.only) {
    return [];
  }

  const selectors = options.only.split(",");
  const filters: FunctionFilter[] = [];
  for (let selector of selectors) {
    if (selector.startsWith("function:")) {
      selector = selector.replace("function:", "");
      const codebaseFragments = selector.split(":");

      if (codebaseFragments.length < 2) {
        // If "codebase" selector isn't included, use the default codebase.
        codebaseFragments.unshift(projectConfig.DEFAULT_CODEBASE);
      } else if (codebaseFragments.length > 2) {
        // Invalid filter format.  Throw error
      }

      filters.push({
        codebase: codebaseFragments[0],
        idChunks: codebaseFragments[1].split(/[-.]/),
      });
    }
  }

  return filters;
}

export function getFunctionLabel(fn: backend.TargetIds): string {
  return `${fn.id}(${fn.region})`;
}
