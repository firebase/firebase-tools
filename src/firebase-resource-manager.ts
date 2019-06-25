import * as clc from "cli-color";

import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";
import { pollOperation } from "./operation-poller";
import { OraWrapper } from "./oraWrapper";

const ONE_SECOND_MILLIS = 1000;

export enum ParentResourceType {
  ORGANIZATION = "organization",
  FOLDER = "folder",
}

export interface ParentResource {
  id: string;
  type: ParentResourceType;
}

export async function createFirebaseProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ParentResource }
): Promise<{ projectId: string }> {
  await createCloudProject(projectId, options);
  const projectInfo = await addFirebaseToCloudProject(projectId);

  logger.info("");
  logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
  logger.info("");
  logger.info("Project information:");
  logger.info(`   - Project ID: ${clc.bold(projectInfo.projectId)}`);
  logger.info(`   - Project Name: ${clc.bold(projectInfo.displayName)}`);
  logger.info("");
  logger.info("Firebase console is available at");
  logger.info(`https://console.firebase.google.com/project/${clc.bold(projectId)}/overview`);
  return projectInfo;
}

/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return {Promise} this function returns a promise that resolves to the new cloud project
 *     information
 */
async function createCloudProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ParentResource }
): Promise<any> {
  const spinner = new OraWrapper("Creating Google Cloud Platform project");
  spinner.start();

  try {
    const response = await api.request("POST", "/v1/projects", {
      auth: true,
      origin: api.resourceManagerOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { projectId, name: options.displayName || projectId, parent: options.parentResource },
    });

    const projectInfo = await pollOperation<any>({
      pollerName: "Project Creation Poller",
      apiOrigin: api.resourceManagerOrigin,
      apiVersion: "v1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    return projectInfo;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to create Google Cloud project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}

/**
 * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
 * to get the new Firebase project information.
 * @return {Promise} this function returns a promise that resolves to the new firebase project
 *    information
 */
async function addFirebaseToCloudProject(projectId: string): Promise<any> {
  const spinner = new OraWrapper("Adding Firebase to Google Cloud project");
  spinner.start();

  // TODO(caot): Removed when "Deferred Analytics" and "Deferred Location" are launched
  const timeZone = "America/Los_Angeles";
  const regionCode = "US";
  const locationId = "us-central";

  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}:addFirebase`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: 15 * ONE_SECOND_MILLIS,
      data: { timeZone, regionCode, locationId },
    });
    const projectInfo = await pollOperation<any>({
      pollerName: "Add Firebase Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    spinner.succeed();
    return projectInfo;
  } catch (err) {
    spinner.fail();
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}
