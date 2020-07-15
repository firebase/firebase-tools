import { FirebaseProjectMetadata, ProjectPage, getFirebaseProjectPage, CloudProjectInfo } from "../management/projects";
import * as api from "../api";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import * as _ from "lodash";
import * as utils from "../utils";
import { promptOnce } from "../prompt";
import * as clc from "cli-color";
const TIMEOUT = 30000;

export interface RemoteConfigTemplateData {
  parameterGroups: any; conditions:any; parameters: any; version:any
}
export interface ParameterGroupsData {name:any; expression:any}  

/**Gets project information/template based on Firebase project ID */
export async function getTemplate(projectId: string, versionNumber = null): Promise<RemoteConfigTemplateData> {
    try {
      var request = `/v1/projects/${projectId}/remoteConfig`
      if (versionNumber) {
        request = request + '?versionNumber=' + versionNumber
      }
      const response = await api.request("GET", request, {
        auth: true,
        origin: api.firebaseRemoteConfigApiOrigin,
        timeout: TIMEOUT,
      });
      return response.body;
    } catch (err) {
      logger.debug(err.message);
      throw new FirebaseError(
        `Failed to get Firebase project ${projectId}. ` +
          "Please make sure the project exists and your account has permission to access it.",
        { exit: 2, original: err }
      );
    }
}

