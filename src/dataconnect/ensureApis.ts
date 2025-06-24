import * as api from "../api";
import { ensure } from "../ensureApiEnabled";

const prefix = "dataconnect";

export async function ensureApis(projectId: string): Promise<void> {
  await ensure(projectId, api.dataconnectOrigin(), prefix);
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
  await ensure(projectId, api.computeOrigin(), prefix);
}

export async function ensureSparkApis(projectId: string): Promise<void> {
  // These are the APIs that can be enabled without a billing account.
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
}

export async function ensureGIFApis(projectId: string): Promise<void> {
  await ensure(projectId, api.cloudAiCompanionOrigin(), prefix);
}
