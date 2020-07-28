import api = require("../api");
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { ListVersionsResult } from "./interfaces";

const TIMEOUT = 30000;
// export interface RemoteConfigVersionTemplateData {
//   versions: any;
// }
// Gets all project versions based on Firebase Project ID
export async function getVersions(projectId: string): Promise<ListVersionsResult> {
  try {
    let request = `/v1/projects/${projectId}/remoteConfig:listVersions`;
    const response = await api.request("GET", request, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get versions for Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err }
    );
  }
}
