import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { RemoteConfigTemplate } from "./interfaces";

const TIMEOUT = 30000;

// Creates a maximum limit of 50 names for each entry
const MAX_DISPLAY_ITEMS = 50;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin,
  apiVersion: "v1",
});

/**
 * Function retrieves names for parameters and parameter groups
 * @param templateItems Input is template.parameters or template.parameterGroups
 * @return {string} Parses the template and returns a formatted string that concatenates items and limits the number of items outputted that is used in the table
 */
export function parseTemplateForTable(
  templateItems: RemoteConfigTemplate["parameters"] | RemoteConfigTemplate["parameterGroups"],
): string {
  let outputStr = "";
  let counter = 0;
  for (const item in templateItems) {
    if (Object.prototype.hasOwnProperty.call(templateItems, item)) {
      outputStr = outputStr.concat(item, "\n");
      counter++;
      if (counter === MAX_DISPLAY_ITEMS) {
        outputStr += "+more..." + "\n";
        break;
      }
    }
  }
  return outputStr;
}

/**
 * Function retrieves the most recent template of the current active project
 * @param projectId Input is the project ID string
 * @param versionNumber Input is the version number string of the project
 * @return {Promise} Returns a promise of a remote config template using the RemoteConfigTemplate interface
 */
export async function getTemplate(
  projectId: string,
  versionNumber?: string,
): Promise<RemoteConfigTemplate> {
  try {
    const params = new URLSearchParams();
    if (versionNumber) {
      params.set("versionNumber", versionNumber);
    }
    const res = await apiClient.request<null, RemoteConfigTemplate>({
      method: "GET",
      path: `/projects/${projectId}/remoteConfig`,
      queryParams: params,
      timeout: TIMEOUT,
    });
    return res.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Firebase Remote Config template for project ${projectId}. `,
      { original: err },
    );
  }
}
