import { dataconnectOrigin } from "../api";
import { Client } from "../apiv2";
import * as operationPoller from "../operation-poller";
import * as types from "./types";

const DATACONNECT_API_VERSION = "v1alpha";
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

export async function deleteService(
  projectId: string,
  locationId: string,
  serviceId: string,
): Promise<types.Service> {
  // NOTE(fredzqm): Don't force delete yet. Backend would leave orphaned resources.
  const op = await dataconnectClient().delete<types.Service>(
    `projects/${projectId}/locations/${locationId}/services/${serviceId}`,
  );
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

/** Connector methods */

export async function getConnector(name: string): Promise<types.Connector> {
  const res = await dataconnectClient().get<types.Connector>(name);
  return res.body;
}

export async function deleteConnector(name: string): Promise<void> {
  const res = await dataconnectClient().delete<void>(name);
  return res.body;
}

export async function listConnectors(serviceName: string) {
  const res = await dataconnectClient().get<{ connectors: types.Connector[] }>(
    `${serviceName}/connectors`,
  );
  return res.body?.connectors || [];
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
