import { dataconnectOrigin } from "../api";
import { Client } from "../apiv2";
import * as operationPoller from "../operation-poller";
import * as types from "./types";

const DATACONNECT_API_VERSION = "v1";
const PAGE_SIZE_MAX = 100;

const dataconnectClient = () =>
  new Client({
    urlPrefix: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    auth: true,
  });

export async function listLocations(projectId: string): Promise<string[]> {
  const res = await dataconnectClient().get<{
    locations: {
      name: string;
      locationId: string;
      displayName: string;
    }[];
  }>(`/projects/${projectId}/locations`);
  return res.body?.locations?.map((l) => l.locationId) ?? [];
}

/** Service methods */
export async function getService(serviceName: string): Promise<types.Service> {
  const res = await dataconnectClient().get<types.Service>(serviceName);
  return res.body;
}

export async function listAllServices(projectId: string): Promise<types.Service[]> {
  const res = await dataconnectClient().get<{ services: types.Service[] }>(
    `/projects/${projectId}/locations/-/services`,
  );
  return res.body.services ?? [];
}

export async function createService(
  projectId: string,
  locationId: string,
  serviceId: string,
): Promise<types.Service> {
  const op = await dataconnectClient().post<types.Service, types.Service>(
    `/projects/${projectId}/locations/${locationId}/services`,
    {
      name: `projects/${projectId}/locations/${locationId}/services/${serviceId}`,
    },
    {
      queryParams: {
        service_id: serviceId,
      },
    },
  );
  const pollRes = await operationPoller.pollOperation<types.Service>({
    apiOrigin: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    operationResourceName: op.body.name,
  });
  return pollRes;
}

export async function deleteService(serviceName: string): Promise<types.Service> {
  // Note that we need to force delete in order to delete child resources too.
  const op = await dataconnectClient().delete<types.Service>(serviceName, {
    queryParams: { force: "true" },
  });
  const pollRes = await operationPoller.pollOperation<types.Service>({
    apiOrigin: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    operationResourceName: op.body.name,
  });
  return pollRes;
}

/** Schema methods */

export async function getSchema(serviceName: string): Promise<types.Schema | undefined> {
  try {
    const res = await dataconnectClient().get<types.Schema>(
      `${serviceName}/schemas/${types.SCHEMA_ID}`,
    );
    return res.body;
  } catch (err: any) {
    if (err.status !== 404) {
      throw err;
    }
    return undefined;
  }
}

export async function upsertSchema(
  schema: types.Schema,
  validateOnly: boolean = false,
): Promise<types.Schema | undefined> {
  const op = await dataconnectClient().patch<types.Schema, types.Schema>(`${schema.name}`, schema, {
    queryParams: {
      allowMissing: "true",
      validateOnly: validateOnly ? "true" : "false",
    },
  });
  if (validateOnly) {
    return;
  }
  return operationPoller.pollOperation<types.Schema>({
    apiOrigin: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    operationResourceName: op.body.name,
  });
}

export async function deleteSchema(serviceName: string): Promise<void> {
  const op = await dataconnectClient().delete<types.Schema>(
    `${serviceName}/schemas/${types.SCHEMA_ID}`,
  );
  await operationPoller.pollOperation<void>({
    apiOrigin: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    operationResourceName: op.body.name,
  });
  return;
}

/** Connector methods */

export async function getConnector(name: string): Promise<types.Connector> {
  const res = await dataconnectClient().get<types.Connector>(name);
  return res.body;
}

export async function deleteConnector(name: string): Promise<void> {
  const op = await dataconnectClient().delete<types.Connector>(name);
  await operationPoller.pollOperation<void>({
    apiOrigin: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    operationResourceName: op.body.name,
  });
  return;
}

export async function listConnectors(serviceName: string, fields: string[] = []) {
  const connectors: types.Connector[] = [];
  const getNextPage = async (pageToken = "") => {
    const res = await dataconnectClient().get<{
      connectors?: types.Connector[];
      nextPageToken?: string;
    }>(`${serviceName}/connectors`, {
      queryParams: {
        pageSize: PAGE_SIZE_MAX,
        pageToken,
        fields: fields.join(","),
      },
    });
    connectors.push(...(res.body.connectors || []));
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };
  await getNextPage();
  return connectors;
}

export async function upsertConnector(connector: types.Connector) {
  const op = await dataconnectClient().patch<types.Connector, types.Connector>(
    `${connector.name}?allow_missing=true`,
    connector,
  );
  const pollRes = await operationPoller.pollOperation<types.Service>({
    apiOrigin: dataconnectOrigin(),
    apiVersion: DATACONNECT_API_VERSION,
    operationResourceName: op.body.name,
  });
  return pollRes;
}
