import * as api from "../api";
import { ensure } from "../ensureApiEnabled";

const prefix = "dataconnect";

export async function ensureApis(projectId: string): Promise<void> {
  await Promise.all([
    ensure(projectId, api.dataconnectOrigin(), prefix),
    ensure(projectId, api.cloudSQLAdminOrigin(), prefix),
  ]);
}

export async function ensureGIFApis(projectId: string): Promise<void> {
  await ensure(projectId, api.cloudAiCompanionOrigin(), prefix);
}
