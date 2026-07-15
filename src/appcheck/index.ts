import { appCheckOrigin } from "../api";
import { Client } from "../apiv2";

export interface DebugToken {
  name: string;
  displayName: string;
  token: string;
  updateTime?: string;
}

interface ListDebugTokensResponse {
  debugTokens?: DebugToken[];
  nextPageToken?: string;
}

const API_VERSION = "v1";

const client = new Client({ urlPrefix: appCheckOrigin(), auth: true, apiVersion: API_VERSION });

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
 * Gets the specified DebugToken.
 */
export async function getDebugToken(name: string): Promise<DebugToken> {
  const res = await client.get<DebugToken>(name);
  return res.body;
}

/**
 * Updates the specified DebugToken.
 */
export async function updateDebugToken(name: string, displayName: string): Promise<DebugToken> {
  const res = await client.patch<Partial<DebugToken>, DebugToken>(
    name,
    { displayName },
    { queryParams: { updateMask: "displayName" } },
  );
  return res.body;
}

/**
 * Deletes the specified DebugToken.
 */
export async function deleteDebugToken(name: string): Promise<void> {
  await client.delete<void>(name);
}
