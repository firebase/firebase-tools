import * as backend from "./backend";
import { DEFAULT_CODEBASE, ValidatedConfig } from "../../functions/projectConfig";
import { assertExhaustive } from "../../functional";

export interface EndpointFilter {
  // If codebase is undefined, match all functions in all codebase that matches the idChunks.
  // This is useful when trying to filter just using id chunks across all codebases.
  codebase?: string;
  // If id chunks is undefined, match all function in the said codebase.
  idChunks?: string[];
  // If environment is undefined, match all environments.
  environment?: string;
}

/**
 * Returns true if endpoint matches any of the given filter.
 *
 * If no filter is passed, always returns true.
 */
export function endpointMatchesAnyFilter(
  endpoint: backend.Endpoint,
  filters?: EndpointFilter[],
): boolean {
  if (!filters) {
    return true;
  }
  return filters.some((filter) => endpointMatchesFilter(endpoint, filter));
}

/**
 * Returns true if endpoint matches the given filter.
 */
export function endpointMatchesFilter(endpoint: backend.Endpoint, filter: EndpointFilter): boolean {
  // Only enforce codebase-based filtering when both the endpoint and filter provides them.
  // This allows us to filter using idChunks across all codebases.
  if (endpoint.codebase && filter.codebase) {
    if (endpoint.codebase !== filter.codebase) {
      return false;
    }
  }

  if (filter.environment) {
    if (endpoint.environment !== filter.environment) {
      return false;
    }
  }

  if (!filter.idChunks) {
    // If idChunks is not provided, we match all functions.
    return true;
  }

  const idChunks = endpoint.id.split("-");
  if (idChunks.length < filter.idChunks.length) {
    return false;
  }
  for (let i = 0; i < filter.idChunks.length; i += 1) {
    if (idChunks[i] !== filter.idChunks[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns list of filters after parsing selector.
 */
export function parseFunctionSelector(
  selector: string,
  config?: ValidatedConfig,
): EndpointFilter[] {
  const fragments = selector.split(":");
  const filters: EndpointFilter[] = [];

  if (fragments.length === 1) {
    const value = fragments[0];
    filters.push({ codebase: value });
    filters.push({ codebase: DEFAULT_CODEBASE, idChunks: value.split(/[-.]/) });

    // "–only functions:environment if there is only one codebase (so this would be the default codebase and one environment)"
    if (config && config.length === 1) {
      filters.push({ codebase: config[0].codebase, environment: value });
    }

    // "–only functions:functionID if there is only one codebase and no environments"
    if (
      config &&
      config.length === 1 &&
      (!config[0].environments || config[0].environments.length === 0)
    ) {
      filters.push({ codebase: config[0].codebase, idChunks: value.split(/[-.]/) });
    }
  }

  if (fragments.length === 2) {
    const first = fragments[0];
    const second = fragments[1];

    // "–only functions:codebase:environment"
    filters.push({ codebase: first, environment: second });

    // "–only functions:codebase:functionIds across all environments"
    filters.push({ codebase: first, idChunks: second.split(/[-.]/) });

    // "--only functions:environment:functionIds if there is only one codebase"
    if (config && config.length === 1) {
      filters.push({
        codebase: DEFAULT_CODEBASE,
        environment: first,
        idChunks: second.split(/[-.]/),
      });
    }
  }

  if (fragments.length >= 3) {
    // "–only functions:codebase:environment:functionIds"
    filters.push({
      codebase: fragments[0],
      environment: fragments[1],
      idChunks: fragments[2].split(/[-.]/),
    });
  }

  return filters;
}

/**
 * Returns parsed --only commandline argument for functions product.
 *
 * For example, when user pass the following commandline argument:
 *   options.only = "functions:abc,functions:g1-gfn,hosting,functions:python:another-func
 *
 * We process the input as follows:
 *
 *   "functions:abc": Filter function w/ id "abc" in the default codebase OR all functions in the "abc" codebase.
 *   "functions:g1-gfn": Filter function w/ id "gfn" in function group g1 OR all functions in the "g1.gfn" codebase.
 *   "hosting": Ignored.
 *   "functions:python:another-func": Filter function w/ id "another-func" in "python" codebase.
 *
 *   Note that filters like "functions:abc" are ambiguous. Is it referring to:
 *     1) Function id "abc" in the default codebase?
 *     2) Grouped functions w/ "abc" prefix in the default codebase?
 *     3) All functions in the "abc" codebase?
 *
 *   If config is provided and "abc" matches a codebase name, we assume it's a codebase selector.
 *   Otherwise, we create filters that match against all conditions.
 *
 *   If no filter exists, we return undefined which the caller should interpret as "match all functions".
 */
export function getEndpointFilters(
  options: { only?: string },
  config: ValidatedConfig,
): EndpointFilter[] | undefined {
  if (!options.only) {
    return undefined;
  }

  const selectors = options.only.split(",");
  const filters: EndpointFilter[] = [];
  for (let selector of selectors) {
    if (selector.startsWith("functions:")) {
      selector = selector.replace("functions:", "");
      if (selector.length > 0) {
        filters.push(...parseFunctionSelector(selector, config));
      }
    }
  }

  if (filters.length === 0) {
    return undefined;
  }
  return filters;
}

/**
 * Get human friendly name for the given function platform
 */
export function getHumanFriendlyPlatformName(platform: backend.Endpoint["platform"]): string {
  if (platform === "gcfv1") {
    return "1st Gen";
  } else if (platform === "gcfv2") {
    return "2nd Gen";
  } else if (platform === "run") {
    return "Cloud Run";
  }
  assertExhaustive(platform);
}

/**
 * Generate label for a function.
 */
export function getFunctionLabel(fn: backend.TargetIds & { codebase?: string }): string {
  let id = `${fn.id}(${fn.region})`;
  if (fn.codebase && fn.codebase !== DEFAULT_CODEBASE) {
    id = `${fn.codebase}:${id}`;
  }
  return id;
}

/**
 * Returns list of codebases specified in firebase.json filtered by --only filters if present.
 */
export function targetCodebases(config: ValidatedConfig, filters?: EndpointFilter[]): string[] {
  const codebasesFromConfig = [...new Set(Object.values(config).map((c) => c.codebase))];
  if (!filters) {
    return [...codebasesFromConfig];
  }

  const codebasesFromFilters = [
    ...new Set(filters.map((f) => f.codebase).filter((c) => c !== undefined)),
  ];

  if (codebasesFromFilters.length === 0) {
    return [...codebasesFromConfig];
  }

  const intersections: string[] = [];
  for (const codebase of codebasesFromConfig) {
    if (codebasesFromFilters.includes(codebase)) {
      intersections.push(codebase);
    }
  }
  return intersections;
}

/**
 * Assign each endpoint deployed in the project to a codebase.
 *
 * An endpoint is part a codebase if:
 *   1. Endpoint is associated w/ the current codebase (duh).
 *   2. Endpoint name matches name of an endpoint we want to deploy
 *
 * Condition (2) might feel wrong but is a practical conflict resolution strategy as it makes migrating a function
 * from one codebase to another straightforward.
 */
export function groupEndpointsByCodebase(
  wantBackends: Record<string, backend.Backend>,
  haveEndpoints: backend.Endpoint[],
): Record<string, backend.Backend> {
  const grouped: Record<string, backend.Backend> = {};
  // endpointsToAssign will hold endpoints not assigned to any codebase.
  let endpointsToAssign: backend.Endpoint[] = haveEndpoints;

  // First, dole out endpoints using names. If resource name matches, endpoint belongs to that codebase regardless
  // of the codebase annotation.
  for (const codebase of Object.keys(wantBackends)) {
    const names = backend.allEndpoints(wantBackends[codebase]).map((e) => backend.functionName(e));
    grouped[codebase] = backend.of(
      ...endpointsToAssign.filter((e) => names.includes(backend.functionName(e))),
    );
    // Remove all endpoints we've assigned in this iteration.
    endpointsToAssign = endpointsToAssign.filter((e) => !names.includes(backend.functionName(e)));
  }

  // Next, dole out endpoints using codebase annotation.
  for (const codebase of Object.keys(wantBackends)) {
    const matchedEndpoints = endpointsToAssign.filter((e) => e.codebase === codebase);
    grouped[codebase] = backend.merge(grouped[codebase], backend.of(...matchedEndpoints));
    // Update current backend, removing all endpoints we've assigned in this iteration.
    const matchedNames = matchedEndpoints.map((e) => backend.functionName(e));
    endpointsToAssign = endpointsToAssign.filter((e) => {
      return !matchedNames.includes(backend.functionName(e));
    });
  }
  // What about unassigned endpoints? We leave them, as it's possible that these endpoints belong to codebases
  // defined in other project repositories.
  return grouped;
}

/** Checks if a codebase should be filtered */
export function isCodebaseFiltered(codebase: string, filters: EndpointFilter[]): boolean {
  return filters.some((filter) => {
    // For a codebase to be filtered, the id chunks MUST be empty.
    const noIdChunks = (filter.idChunks || []).length === 0;
    return noIdChunks && filter.codebase === codebase;
  });
}

/** Checks if a function should be filtered given a list of endpoints. */
export function isEndpointFiltered(endpoint: backend.Endpoint, filters: EndpointFilter[]) {
  return filters.some((filter) => endpointMatchesFilter(endpoint, filter));
}
