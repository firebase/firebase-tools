import { dataconnectOrigin } from "../api";
export { dataconnectOrigin } from "../api";
import { Client, ClientResponse } from "../apiv2";
import * as types from "./types";

export const DATACONNECT_API_VERSION = "v1";

export function dataconnectDataplaneClient(): Client {
  return new Client({
    urlPrefix: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    auth: true,
  });
}
export async function executeGraphQL(
  client: Client,
  servicePath: string,
  body: types.ExecuteGraphqlRequest,
): Promise<ClientResponse<types.GraphqlResponse | types.GraphqlResponseError>> {
  const res = await client.post<
    types.ExecuteGraphqlRequest,
    types.GraphqlResponse | types.GraphqlResponseError
  >(`${servicePath}:executeGraphql`, body, { resolveOnHTTPError: true });
  return res;
}

export async function executeGraphQLRead(
  client: Client,
  servicePath: string,
  body: types.ExecuteGraphqlRequest,
): Promise<ClientResponse<types.GraphqlResponse | types.GraphqlResponseError>> {
  const res = await client.post<
    types.ExecuteGraphqlRequest,
    types.GraphqlResponse | types.GraphqlResponseError
  >(`${servicePath}:executeGraphqlRead`, body, { resolveOnHTTPError: true });
  return res;
}

export async function executeGraphQLQuery(
  client: Client,
  connectorPath: string,
  body: types.ExecuteOperationRequest,
): Promise<ClientResponse<types.GraphqlResponse | types.GraphqlResponseError>> {
  const res = await client.post<
    types.ExecuteOperationRequest,
    types.GraphqlResponse | types.GraphqlResponseError
  >(`${connectorPath}:executeQuery`, body, { resolveOnHTTPError: true });
  return res;
}

export async function executeGraphQLMutation(
  client: Client,
  connectorPath: string,
  body: types.ExecuteOperationRequest,
): Promise<ClientResponse<types.GraphqlResponse | types.GraphqlResponseError>> {
  const res = await client.post<
    types.ExecuteOperationRequest,
    types.GraphqlResponse | types.GraphqlResponseError
  >(`${connectorPath}:executeMutation`, body, { resolveOnHTTPError: true });
  return res;
}
