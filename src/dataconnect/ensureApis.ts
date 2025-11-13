import * as api from "../api";
import { configstore } from "../configstore";
import { check, ensure } from "../ensureApiEnabled";

const prefix = "dataconnect";

export async function ensureApis(projectId: string, silent: boolean = false): Promise<void> {
  await Promise.all([
    ensure(projectId, api.dataconnectOrigin(), prefix, silent),
    ensure(projectId, api.cloudSQLAdminOrigin(), prefix, silent),
  ]);
}

/**
 * Check if GIF APIs are enabled.
 * If the Gemini in Firebase ToS is accepted, ensure the API is enabled.
 * Otherwise, return false. The caller should prompt the user to accept the ToS.
 */
export async function ensureGIFApiTos(projectId: string): Promise<boolean> {
  if (configstore.get("gemini")) {
    await ensure(projectId, api.cloudAiCompanionOrigin(), "");
  } else {
    if (!(await check(projectId, api.cloudAiCompanionOrigin(), ""))) {
      return false;
    }
  }
  return true;
}
