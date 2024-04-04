import { dataconnectOrigin } from "../api";
import { Client } from "../apiv2";
import * as types from "./types";

interface GraphqlRequest {
  name: string;
  query: string;
  operationName?: string;
  variables?: { [key: string]: string };
  extensions?: { impersonate?: types.Impersonation };
}

interface GraphqlResponse {
  data: any;
  errors: any[];
}
const DATACONNECT_API_VERSION = "v1alpha";

const dataconnectDataplaneClient = () =>
  new Client({
    urlPrefix: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    auth: true,
  });

export async function executeGraphQL(servicePath: string, body: GraphqlRequest) {
  const res = await dataconnectDataplaneClient().post<GraphqlRequest, GraphqlResponse>(
    servicePath,
    body,
  );
  return res;
}
