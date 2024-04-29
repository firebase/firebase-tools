import { dataconnectOrigin } from "../api";
import { Client } from "../apiv2";
import * as types from "./types";

const DATACONNECT_API_VERSION = "v1alpha";

const dataconnectDataplaneClient = () =>
  new Client({
    urlPrefix: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    auth: true,
  });

export async function executeGraphQL(servicePath: string, body: types.ExecuteGraphqlRequest) {
  const res = await dataconnectDataplaneClient().post<
    types.ExecuteGraphqlRequest,
    types.ExecuteGraphqlResponse | types.ExecuteGraphqlResponseError
  >(`${servicePath}:executeGraphql`, body, { resolveOnHTTPError: true });
  return res;
}
