import * as backend from "./backend";
import {
  DEFAULT_CODEBASE,
  ValidatedConfig,
  ValidatedSingle,
  isKitConfig,
} from "../../functions/projectConfig";
import { assertExhaustive } from "../../functional";

export interface EndpointFilter {
  // If codebase is undefined, match all functions in all codebase that matches the idChunks.
  // This is useful when trying to filter just using id chunks across all codebases.
  codebase?: string;
  // If id chunks is undefined, match all function in the said codebase.
  idChunks?: string[];
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
 * Supports filtering by codebase, exact function name, or hierarchical function group.
 */
export function endpointMatchesFilter(endpoint: backend.Endpoint, filter: EndpointFilter): boolean {
  // If the filter targets a specific codebase, verify that the endpoint belongs to it.
  // Endpoints without an explicit codebase label default to the default codebase.
  if (filter.codebase) {
    const endpointCodebase = endpoint.codebase || DEFAULT_CODEBASE;
    if (endpointCodebase !== filter.codebase) {
      return false;
    }
  }

  // If idChunks is not provided or empty, the filter matches all functions within the targeted codebase.
  if (!filter.idChunks || filter.idChunks.length === 0) {
    return true;
  }

  // Exact function match (e.g. 'myFunc') or hierarchical group match (e.g. 'groupA' matches 'groupA-func1').
  // Enforces a strict hyphen boundary so 'app' does not match 'apple-pay'.
  const filterPrefix = filter.idChunks.join("-");
  return endpoint.id === filterPrefix || endpoint.id.startsWith(`${filterPrefix}-`);
}

/**
 * Returns all codebase names and kit instance IDs defined in the configuration.
 */
export function getCodebasesFromConfig(config: ValidatedSingle[] = []): string[] {
  return [
    ...new Set(config.flatMap((c) => (isKitConfig(c) ? Object.keys(c.instances) : [c.codebase]))),
  ];
}

/**
 * Returns list of filters after parsing selector.
 */
export function parseFunctionSelector(
  selector: string,
  config: ValidatedSingle[] = [],
): EndpointFilter[] {
  const fragments = selector.split(":");
  const target = fragments[0];

  // Check if target matches a known codebase name or kit instance ID
  const codebaseNames = getCodebasesFromConfig(config);

  if (codebaseNames.includes(target)) {
    return [
      {
        codebase: target,
        ...(fragments.length > 1 ? { idChunks: fragments[1].split(/[-.]/) } : {}),
      },
    ];
  }

  if (fragments.length < 2) {
    // It's not a codebase or kit instance name, assume it is a function id in default codebase
    return [{ codebase: DEFAULT_CODEBASE, idChunks: fragments[0].split(/[-.]/) }];
  }
  return [
    {
      codebase: fragments[0],
      idChunks: fragments[1].split(/[-.]/),
    },
  ];
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
  const codebasesFromConfig = getCodebasesFromConfig(config);
  if (!filters) {
    return [...codebasesFromConfig];
  }

  const codebasesFromFilters = [
    ...new Set(filters.map((f) => f.codebase).filter((c): c is string => c !== undefined)),
  ];

  if (codebasesFromFilters.length === 0) {
    return [...codebasesFromConfig];
  }

  return codebasesFromConfig.filter((codebase) => codebasesFromFilters.includes(codebase));
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
export function isEndpointFiltered(endpoint: backend.Endpoint, filters: EndpointFilter[]): boolean {
  return filters.some((filter) => endpointMatchesFilter(endpoint, filter));
}

/**
 * Parses raw CLI filter strings for functions:delete into EndpointFilter objects.
 *
 * When a user passes an unqualified target (e.g. 'myFunc' without a ':' prefix),
 * parseFunctionSelector defaults the codebase to 'default' unless it matches an active
 * codebase name. For functions:delete, an unqualified function name should match that
 * function ID across ANY active codebase rather than restricting to 'default'.
 * Therefore, when a filter has no ':' prefix and is scoped to 'default' by default,
 * we remove the codebase restriction so it matches globally by ID.
 */
export function parseDeleteFilters(filters: string[], activeCodebases: string[]): EndpointFilter[] {
  const liveCodebasesConfig = activeCodebases.map((codebase) => ({ source: "", codebase }));
  return filters.flatMap((f) => {
    const parsed = parseFunctionSelector(f, liveCodebasesConfig);
    return parsed.map((filter) =>
      !f.includes(":") && filter.codebase === DEFAULT_CODEBASE && filter.idChunks
        ? { idChunks: filter.idChunks }
        : filter,
    );
  });
}

export interface CodebaseCollision {
  filter: string;
  codebase: string;
  functionLabel: string;
  workaroundCommand: string;
}

/**
 * Detects name collisions between active codebase names and existing function IDs or groups.
 *
 * When a user targets a name (e.g. 'api'), if that name matches BOTH an active codebase
 * and a live function ID or function group prefix ('api-func'), codebase deletion takes
 * precedence by design. We warn the user about the collision and provide the explicit
 * '<codebase>:<name>' workaround syntax to delete the function instead.
 */
export function detectCodebaseAndIdCollisions(
  filters: string[],
  activeCodebases: string[],
  allEndpoints: backend.Endpoint[],
  defaultCodebase = DEFAULT_CODEBASE,
): CodebaseCollision[] {
  const collisions: CodebaseCollision[] = [];
  for (const f of filters) {
    // If the filter is explicitly codebase-scoped ('codebase:func') or doesn't match an active
    // codebase name, there can be no codebase vs function ID name collision.
    if (f.includes(":") || !activeCodebases.includes(f)) {
      continue;
    }
    // This filter DOES match an active codebase name. If it ALSO matches an existing function ID
    // or function group prefix (e.g. 'group-func'), a name collision exists.
    const matchingEndpoints = allEndpoints.filter((ep) => ep.id === f || ep.id.startsWith(`${f}-`));
    if (matchingEndpoints.length > 0) {
      const ep = matchingEndpoints[0];
      const prefix = ep.codebase || defaultCodebase;
      collisions.push({
        filter: f,
        codebase: prefix,
        functionLabel: getFunctionLabel(ep),
        workaroundCommand: `firebase functions:delete ${prefix}:${f}`,
      });
    }
  }
  return collisions;
}
