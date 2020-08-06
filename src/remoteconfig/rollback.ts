import { RemoteConfigTemplate } from "./interfaces";
import api = require("../api");
import logger = require("../logger");
import { FirebaseError } from "../error";
import * as rcGet from "../remoteconfig/get";

const TIMEOUT = 30000;

/**
 * Function rollsback project to the one specified by the version number provided
 * @param projectId Input is the project ID string
 * @return {Promise} Returns a promise of a remote config template using the RemoteConfigTemplate interface
 */
export async function rollbackTemplate(
    projectId: string,
    versionNumber?: number
  ): Promise<void> {
    try {
      let request = `/v1/projects/${projectId}/remoteConfig:rollback`;
      if (versionNumber) {
        request = request + "?versionNumber=" + versionNumber;
      } else {
        const template = await rcGet.getTemplate(projectId).then();
        if (template?.version?.versionNumber) {
          const latestVersion = template.version.versionNumber.toString();
          const previousVersion = parseInt(latestVersion) - 1;
          request = request + "?versionNumber=" + previousVersion;
        }
      }
      const response = await api.request("POST", request, {
        auth: true,
        origin: api.remoteConfigApiOrigin,
        timeout: TIMEOUT,
      });
      return response.body;
    } catch (err) {
      logger.debug(err.message);
      throw new FirebaseError(
        `Failed to rollback Firebase Remote Config template for project ${projectId}. `,
        { exit: 2, original: err }
      );
    }
  }