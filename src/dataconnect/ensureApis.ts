import * as api from "../api";
import { ensure } from "../ensureApiEnabled";

export async function ensureApis(projectId: string): Promise<void> {
  const prefix = "dataconnect";
  await ensure(projectId, api.dataconnectOrigin(), prefix);
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
  await ensure(projectId, api.computeOrigin(), prefix);
}

export async function ensureSparkApis(projectId: string): Promise<void> {
  const prefix = "dataconnect";
  // These are the APIs that can be enabled without a billing account.
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
}
