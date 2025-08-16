import * as api from "../api";
import { check, ensure } from "../ensureApiEnabled";

const prefix = "dataconnect";

export async function isApiEnabled(projectId: string): Promise<boolean> {
  return await check(projectId, api.dataconnectOrigin(), prefix);
}

export async function ensureApis(projectId: string): Promise<void> {
  await ensure(projectId, api.dataconnectOrigin(), prefix);
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
}

export async function ensureSparkApis(projectId: string): Promise<void> {
  // These are the APIs that can be enabled without a billing account.
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
  await ensure(projectId, api.dataconnectOrigin(), prefix);
}

export async function ensureGIFApis(projectId: string): Promise<void> {
  await ensure(projectId, api.cloudAiCompanionOrigin(), prefix);
}
