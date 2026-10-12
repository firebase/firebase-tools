import * as api from "../api";
import { ensure } from "../ensureApiEnabled";

const prefix = "dataconnect";

export async function ensureApis(projectId: string, silent: boolean = false): Promise<void> {
  await Promise.all([
    ensure(projectId, api.dataconnectOrigin(), prefix, silent),
    ensure(projectId, api.cloudSQLAdminOrigin(), prefix, silent),
  ]);
}
