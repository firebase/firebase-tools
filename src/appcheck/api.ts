import { appCheckOrigin } from "../api";
import { Client } from "../apiv2";
import { DebugToken, EnforcementMode, ListDebugTokensResponse, Service } from "./types";

/**
 * The raw list response. `services` is absent rather than empty when a project
 * has no service configured, which is why callers get a plain array from
 * `listServices` instead of this shape.
 */
interface ListServicesResponse {
  services?: Service[];
  nextPageToken?: string;
}

const API_VERSION = "v1";

export const client = new Client({
  urlPrefix: appCheckOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

/**
 * Creates a new DebugToken for the specified app.
 */
export async function createDebugToken(
  projectNumber: string,
  appId: string,
  displayName: string,
  token: string,
): Promise<DebugToken> {
  const parent = `projects/${projectNumber}/apps/${appId}`;
  const res = await client.post<Partial<DebugToken>, DebugToken>(`${parent}/debugTokens`, {
    displayName,
    token,
  });
  return res.body;
}

/**
 * Lists all DebugTokens for the specified app.
 */
export async function listDebugTokens(projectNumber: string, appId: string): Promise<DebugToken[]> {
  const parent = `projects/${projectNumber}/apps/${appId}`;
  const debugTokens: DebugToken[] = [];
  let pageToken = "";
  do {
    const queryParams: Record<string, string> = {};
    if (pageToken) {
      queryParams.pageToken = pageToken;
    }
    const res = await client.get<ListDebugTokensResponse>(`${parent}/debugTokens`, { queryParams });
    if (res.body?.debugTokens) {
      debugTokens.push(...res.body.debugTokens);
    }
    pageToken = res.body?.nextPageToken || "";
  } while (pageToken);
  return debugTokens;
}

/**
 * Deletes the specified DebugToken.
 */
export async function deleteDebugToken(name: string): Promise<void> {
  await client.delete<void>(name);
}

/**
 * Lists the App Check services that have a configuration.
 *
 * A service nobody ever configured is left out of this response, so callers
 * that want the full picture should merge this with the known service list.
 */
export async function listServices(projectNumber: string): Promise<Service[]> {
  const services: Service[] = [];
  let pageToken = "";
  do {
    const queryParams: Record<string, string> = {};
    if (pageToken) {
      queryParams.pageToken = pageToken;
    }
    const res = await client.get<ListServicesResponse>(`projects/${projectNumber}/services`, {
      queryParams,
    });
    if (res.body?.services) {
      services.push(...res.body.services);
    }
    pageToken = res.body?.nextPageToken || "";
  } while (pageToken);
  return services;
}

/**
 * Gets the App Check settings for one service.
 *
 * A supported service that was never configured still answers 200, with no
 * `enforcementMode` and an epoch `updateTime`. An unsupported service id
 * answers 400, which is why callers validate the id first.
 */
export async function getService(projectNumber: string, serviceId: string): Promise<Service> {
  const res = await client.get<Service>(`projects/${projectNumber}/services/${serviceId}`);
  return res.body;
}

/**
 * Updates the App Check settings for one service.
 *
 * The update mask lists only the fields we mean to write, so a call that sets
 * enforcement does not silently reset replay protection.
 */
export async function updateService(
  projectNumber: string,
  serviceId: string,
  update: { enforcementMode: EnforcementMode; replayProtection?: EnforcementMode },
): Promise<Service> {
  const updateMask = ["enforcementMode"];
  if (update.replayProtection) {
    updateMask.push("replayProtection");
  }
  const res = await client.patch<Partial<Service>, Service>(
    `projects/${projectNumber}/services/${serviceId}`,
    update,
    { queryParams: { updateMask: updateMask.join(",") } },
  );
  return res.body;
}
