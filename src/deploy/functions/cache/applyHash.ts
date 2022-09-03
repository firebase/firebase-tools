import { Backend, allEndpoints } from "../backend";
import * as args from "../args";
import { getEndpointHash, getEnvironmentVariablesHash, getSecretsHash } from "./hash";
import { EndpointFilter, isCodebaseFiltered, isEndpointFiltered } from "../functionsDeployHelper";

/**
 *
 * Updates all the CodeBase {@link Backend}, applying a hash to each of their {@link Endpoint}.
 */
export function applyBackendHashToBackends(
  wantBackends: Record<string, Backend>,
  context: args.Context
): void {
  for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
    // If an entire codebase is filtered, then don't set the hash for the functions in the codebase.
    // This effectively forces all the functions to deploy without the duplication check.
    if (isCodebaseFiltered(codebase, context.filters || [])) {
      continue;
    }
    const source = context?.sources?.[codebase]; // populated earlier in prepare flow
    const envHash = getEnvironmentVariablesHash(wantBackend);
    applyBackendHashToEndpoints(
      wantBackend,
      envHash,
      context.filters || [],
      source?.functionsSourceV1Hash,
      source?.functionsSourceV2Hash
    );
  }
}

/**
 * Updates {@link Backend}, applying a unique hash to each {@link Endpoint}.
 */
function applyBackendHashToEndpoints(
  wantBackend: Backend,
  envHash: string,
  endpointFilters: EndpointFilter[],
  sourceV1Hash?: string,
  sourceV2Hash?: string
): void {
  for (const endpoint of allEndpoints(wantBackend)) {
    const secretsHash = getSecretsHash(endpoint);
    const isV2 = endpoint.platform === "gcfv2";
    const sourceHash = isV2 ? sourceV2Hash : sourceV1Hash;
    // If the endpoint is in the filtered list, then skip setting a hash (effectively forcing a deploy).
    if (isEndpointFiltered(endpoint, endpointFilters)) {
      continue;
    }
    endpoint.hash = getEndpointHash(sourceHash, envHash, secretsHash);
  }
}
