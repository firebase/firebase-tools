import * as api from "../api";
import { ensure } from "../ensureApiEnabled";

export async function ensureApis(projectId: string): Promise<void> {
  const prefix = "dataconnect";
  await ensure(projectId, api.dataconnectOrigin(), prefix);
  await ensure(projectId, api.cloudSQLAdminOrigin(), prefix);
  await ensure(projectId, api.computeOrigin(), prefix);
}
