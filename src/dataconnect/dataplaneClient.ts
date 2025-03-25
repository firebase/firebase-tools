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
): Promise<ClientResponse<types.ExecuteGraphqlResponse | types.ExecuteGraphqlResponseError>> {
  const res = await client.post<
    types.ExecuteGraphqlRequest,
    types.ExecuteGraphqlResponse | types.ExecuteGraphqlResponseError
  >(`${servicePath}:executeGraphql`, body, { resolveOnHTTPError: true });
  return res;
}
