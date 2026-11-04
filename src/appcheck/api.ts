import { appCheckOrigin } from "../api";
import { Client } from "../apiv2";
import {
  DebugToken,
  EnforcementMode,
  ListDebugTokensResponse,
  ProviderConfig,
  ProviderType,
  Service,
} from "./types";
import { PROVIDER_META } from "./providers";

/**
 * The raw list response. `services` is absent rather than empty when a project
 * has no service configured, which is why callers get a plain array from
 * `listServices` instead of this shape.
 */
interface ListServicesResponse {
  services?: Service[];
  nextPageToken?: string;
}

/**
 * The raw batchGet response, which every provider keys as `configs`. The field
 * is absent rather than empty when no app has that provider configured, which
 * is why callers get a plain array from `batchGetProviderConfigs`.
 */
interface BatchGetConfigsResponse {
  configs?: ProviderConfig[];
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

/**
 * Gets one provider config for one app.
 *
 * This always answers 200, even for an app that never used the provider: the
 * response then carries the API defaults. Callers use `isConfigured` to tell
 * the two apart where the config has a secret field to look at.
 */
export async function getProviderConfig(
  projectNumber: string,
  appId: string,
  provider: ProviderType,
): Promise<ProviderConfig> {
  const { configResource } = PROVIDER_META[provider];
  const res = await client.get<ProviderConfig>(
    `projects/${projectNumber}/apps/${appId}/${configResource}`,
  );
  return res.body;
}

/**
 * Writes one provider config for one app.
 *
 * The update mask lists only the fields the user asked to change, so setting a
 * site key does not reset the token TTL that was already there.
 */
export async function updateProviderConfig(
  projectNumber: string,
  appId: string,
  provider: ProviderType,
  update: ProviderConfig,
  updateMask: string[],
): Promise<ProviderConfig> {
  const { configResource } = PROVIDER_META[provider];
  const res = await client.patch<ProviderConfig, ProviderConfig>(
    `projects/${projectNumber}/apps/${appId}/${configResource}`,
    update,
    { queryParams: { updateMask: updateMask.join(",") } },
  );
  return res.body;
}

/**
 * Gets one provider config for every app in the project, in one call.
 *
 * Used by apps:list so a project with ten apps costs five calls instead of
 * fifty. The response is empty when no app has that provider configured.
 */
export async function batchGetProviderConfigs(
  projectNumber: string,
  provider: ProviderType,
): Promise<ProviderConfig[]> {
  const { configResource } = PROVIDER_META[provider];
  const res = await client.get<BatchGetConfigsResponse>(
    `projects/${projectNumber}/apps/-/${configResource}:batchGet`,
  );
  // Every batchGet response uses the same `configs` key, and the body is empty
  // when no app in the project has that provider configured.
  return res.body?.configs ?? [];
}
