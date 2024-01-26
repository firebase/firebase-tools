import { rulesOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import * as utils from "../utils";

const API_VERSION = "v1";

const apiClient = new Client({ urlPrefix: rulesOrigin, apiVersion: API_VERSION });

function _handleErrorResponse(response: any): any {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[rules] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with rules.", {
    code: 2,
  });
}

/**
 * Gets the latest ruleset name on the project.
 * @param projectId Project from which you want to get the ruleset.
 * @param service Service for the ruleset (ex: cloud.firestore or firebase.storage).
 * @return Name of the latest ruleset.
 */
export async function getLatestRulesetName(
  projectId: string,
  service: string,
): Promise<string | null> {
  const releases = await listAllReleases(projectId);
  const prefix = `projects/${projectId}/releases/${service}`;
  const release = releases.find((r) => r.name.startsWith(prefix));

  if (!release) {
    return null;
  }
  return release.rulesetName;
}

const MAX_RELEASES_PAGE_SIZE = 10;

/**
 * Lists the releases for the given project.
 */
export async function listReleases(
  projectId: string,
  pageToken = "",
): Promise<ListReleasesResponse> {
  const response = await apiClient.get<ListReleasesResponse>(`/projects/${projectId}/releases`, {
    queryParams: {
      pageSize: MAX_RELEASES_PAGE_SIZE,
      pageToken,
    },
  });
  if (response.status === 200) {
    return response.body;
  }
  return _handleErrorResponse(response);
}

export interface Release {
  name: string;
  rulesetName: string;
  createTime: string;
  updateTime: string;
}

export interface ListReleasesResponse {
  releases?: Release[];
  nextPageToken?: string;
}

/**
 * Lists all the releases for the given project, in reverse chronological order.
 *
 * May require many network requests.
 */
export async function listAllReleases(projectId: string): Promise<Release[]> {
  let pageToken;
  let releases: Release[] = [];
  do {
    const response: ListReleasesResponse = await listReleases(projectId, pageToken);
    if (response.releases && response.releases.length > 0) {
      releases = releases.concat(response.releases);
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  return releases.sort((a, b) => b.createTime.localeCompare(a.createTime));
}

export interface RulesetFile {
  name: string;
  content: string;
}

export interface RulesetSource {
  files: RulesetFile[];
}

/**
 * Gets the full contents of a ruleset.
 * @param name Name of the ruleset.
 * @return Array of files in the ruleset. Each entry has form { content, name }.
 */
export async function getRulesetContent(name: string): Promise<RulesetFile[]> {
  const response = await apiClient.get<{ source: RulesetSource }>(`/${name}`, {
    skipLog: { resBody: true },
  });
  if (response.status === 200) {
    const source = response.body.source;
    return source.files;
  }

  return _handleErrorResponse(response);
}

const MAX_RULESET_PAGE_SIZE = 100;

/**
 * Lists the rulesets for the given project.
 */
export async function listRulesets(
  projectId: string,
  pageToken: string = "",
): Promise<ListRulesetsResponse> {
  const response = await apiClient.get<ListRulesetsResponse>(`/projects/${projectId}/rulesets`, {
    queryParams: {
      pageSize: MAX_RULESET_PAGE_SIZE,
      pageToken,
    },
    skipLog: { resBody: true },
  });
  if (response.status === 200) {
    return response.body;
  }
  return _handleErrorResponse(response);
}

/**
 * Lists all the rulesets for the given project, in reverse chronological order.
 *
 * May require many network requests.
 */
export async function listAllRulesets(projectId: string): Promise<ListRulesetsEntry[]> {
  let pageToken;
  let rulesets: ListRulesetsEntry[] = [];
  do {
    const response: ListRulesetsResponse = await listRulesets(projectId, pageToken);
    if (response.rulesets) {
      rulesets = rulesets.concat(response.rulesets);
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  return rulesets.sort((a, b) => b.createTime.localeCompare(a.createTime));
}

export interface ListRulesetsResponse {
  rulesets?: ListRulesetsEntry[];
  nextPageToken?: string;
}

export interface ListRulesetsEntry {
  name: string;
  createTime: string; // ISO 8601 format
}

export function getRulesetId(ruleset: ListRulesetsEntry): string {
  // Ruleset names looks like "projects/<project>/rulesets/<ruleset_id>"
  return ruleset.name.split("/").pop()!;
}

/**
 * Delete the ruleset from the given project. If the ruleset is referenced
 * by a release, the operation will fail.
 */
export async function deleteRuleset(projectId: string, id: string): Promise<void> {
  const response = await apiClient.delete(`/projects/${projectId}/rulesets/${id}`);
  if (response.status === 200) {
    return;
  }
  return _handleErrorResponse(response);
}

/**
 * Creates a new ruleset which can then be associated with a release.
 * @param projectId Project on which you want to create the ruleset.
 * @param {Array} files Array of `{name, content}` for the source files.
 */
export async function createRuleset(projectId: string, files: RulesetFile[]): Promise<string> {
  const payload = { source: { files } };

  const response = await apiClient.post<unknown, { name: string }>(
    `/projects/${projectId}/rulesets`,
    payload,
    { skipLog: { body: true } },
  );
  if (response.status === 200) {
    logger.debug("[rules] created ruleset", response.body.name);
    return response.body.name;
  }

  return _handleErrorResponse(response);
}

/**
 * Create a new named release with the specified ruleset.
 * @param projectId Project on which you want to create the ruleset.
 * @param rulesetName The unique identifier for the ruleset you want to release.
 * @param releaseName The name (e.g. `firebase.storage`) of the release you want to create.
 */
export async function createRelease(
  projectId: string,
  rulesetName: string,
  releaseName: string,
): Promise<string> {
  const payload = {
    name: `projects/${projectId}/releases/${releaseName}`,
    rulesetName,
  };

  const response = await apiClient.post<unknown, { name: string }>(
    `/projects/${projectId}/releases`,
    payload,
  );
  if (response.status === 200) {
    logger.debug("[rules] created release", response.body.name);
    return response.body.name;
  }

  return _handleErrorResponse(response);
}

/**
 * Update an existing release with the specified ruleset.
 * @param projectId Project on which you want to create the ruleset.
 * @param rulesetName The unique identifier for the ruleset you want to release.
 * @param releaseName The name (e.g. `firebase.storage`) of the release you want to update.
 */
export async function updateRelease(
  projectId: string,
  rulesetName: string,
  releaseName: string,
): Promise<string> {
  const payload = {
    release: {
      name: `projects/${projectId}/releases/${releaseName}`,
      rulesetName,
    },
  };

  const response = await apiClient.patch<unknown, { name: string }>(
    `/projects/${projectId}/releases/${releaseName}`,
    payload,
  );
  if (response.status === 200) {
    logger.debug("[rules] updated release", response.body.name);
    return response.body.name;
  }

  return _handleErrorResponse(response);
}

export async function updateOrCreateRelease(
  projectId: string,
  rulesetName: string,
  releaseName: string,
): Promise<string> {
  logger.debug("[rules] releasing", releaseName, "with ruleset", rulesetName);
  return updateRelease(projectId, rulesetName, releaseName).catch(() => {
    logger.debug("[rules] ruleset update failed, attempting to create instead");
    return createRelease(projectId, rulesetName, releaseName);
  });
}

export function testRuleset(projectId: string, files: RulesetFile[]): Promise<any> {
  return apiClient.post(
    `/projects/${encodeURIComponent(projectId)}:test`,
    { source: { files } },
    { skipLog: { body: true } },
  );
}
