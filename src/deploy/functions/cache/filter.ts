import { allEndpoints, Backend, Endpoint, findEndpoint } from "../backend";

/**
 * Filters all NoOp {@link Endpoint}
 */
export function filterNoOpFunctions(wantBackends: Backend[], haveBackends: Backend[]) {
  const haveBackendHashMap = getHaveBackendHashMap(haveBackends);
  for (const wantBackend of wantBackends) {
    const endpoints = getNoOpFunctions(wantBackend, haveBackendHashMap);
    // TODO(tystark) remove endpoints
    // TODO(tystark) CLI messaging here
  }
}

/**
 * Retrieves a list of no-op Function/Endpoints from a {@link Backend}
 */
export function getNoOpFunctions(
  wantBackend: Backend,
  haveBackendHashMap: Map<string, string | undefined>
) {
  const wantEndpoints = allEndpoints(wantBackend);
  return wantEndpoints.filter((wantEndpoint) => {
    const haveBackendHash = haveBackendHashMap.get(wantEndpoint.id);
    const wantEndpointHash = wantEndpoint.hash;
    return wantEndpointHash && haveBackendHash === wantEndpointHash;
  });
}

/**
 * Retrieves a {@link Map} of Hashes by EndpointId
 * @param haveBackends List of backends
 */
function getHaveBackendHashMap(haveBackends: Backend[]): Map<string, string | undefined> {
  const hashesById = new Map();
  for (const haveBackend of haveBackends) {
    allEndpoints(haveBackend).forEach((endpoint) => {
      hashesById.set(endpoint.id, endpoint?.hash);
    });
  }
  return hashesById;
}
