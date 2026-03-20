import { remoteConfigApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { RemoteConfigTemplate } from "./interfaces";

const TIMEOUT = 30000;

const apiClient = new Client({
  urlPrefix: remoteConfigApiOrigin(),
  apiVersion: "v1",
});

/**
 * Function to publish a new remote config template for a project
 * This is added to support publish operation for RC MCP tooling
 * @param projectId Input is the project ID string
 * @param template The new template to be published
 * @param options Takes in parameter `force` to force update the template
 * @return {Promise} Returns a promise of a RemoteConfigTemplate
 */
export async function publishTemplate(
  projectId: string,
  template: RemoteConfigTemplate,
  options?: { force: boolean },
): Promise<RemoteConfigTemplate> {
  try {
    let ifMatch = template.etag;
    if (options && options.force === true) {
      // setting `If-Match = "*"` forces the Remote Config template to be updated
      // and circumvent the ETag
      ifMatch = "*";
    }

    const requestBody = {
      conditions: template.conditions,
      parameters: template.parameters,
      parameterGroups: template.parameterGroups,
      version: template.version,
    };

    const res = await apiClient.request<null, RemoteConfigTemplate>({
      method: "PUT",
      path: `/projects/${projectId}/remoteConfig`,
      timeout: TIMEOUT,
      headers: { "If-Match": ifMatch },
      body: JSON.stringify(requestBody),
    });

    return res.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to publish Firebase Remote Config template for project ${projectId}. `,
      { original: err },
    );
  }
}
