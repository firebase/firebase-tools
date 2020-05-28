import * as api from "../api";
import * as logger from "../logger";

export async function checkDatabaseType(projectId: string): Promise<string | undefined> {
  try {
    const resp = await api.request("GET", "/v1/apps/" + projectId, {
      auth: true,
      origin: api.appengineOrigin,
    });

    return resp.body.databaseType;
  } catch (err) {
    logger.debug("error getting database type", err);
    return undefined;
  }
}
