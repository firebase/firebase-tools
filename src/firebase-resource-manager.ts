import * as clc from "cli-color";

import * as api from "./api";
import * as FirebaseError from "./error";
import * as logger from "./logger";
import { LroPoller, LroPollerOptions } from "./lro-poller";
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

export class FirebaseResourceManager {
  private poller: LroPoller = new LroPoller();

  async createFirebaseProject(
    projectId: string,
    projectDisplayName: string,
    parentResource?: ParentResource
  ): Promise<{ projectId: string }> {
    await this.createCloudProject(projectId, projectDisplayName, parentResource);
    const projectInfo = await this.addFirebaseToCloudProject(projectId);

    logger.info("");
    logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
    logger.info("");
    logger.info("Project information:");
    logger.info(`   - Project ID: ${clc.bold(projectInfo.projectId)}`);
    logger.info(`   - Project Name: ${clc.bold(projectInfo.displayName)}`);
    logger.info("");
    logger.info("Firebase console is available at");
    logger.info(`https://console.firebase.google.com/project/${clc.bold(projectId)}/overview`);
    return { projectId };
  }

  /**
   * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
   * new project information.
   * @return {Promise} this function returns a promise that resolves to the new cloud project
   *     information
   */
  private async createCloudProject(
    projectId: string,
    projectDisplayName: string,
    parentResource?: ParentResource
  ): Promise<any> {
    const spinner = new OraWrapper("Creating Google Cloud Platform project");
    spinner.start();

    try {
      const response = await api.request("POST", "/v1/projects", {
        auth: true,
        origin: api.resourceManagerOrigin,
        timeout: 15 * ONE_SECOND_MILLIS,
        data: { projectId, name: projectDisplayName, parent: parentResource },
      });
      const projectInfo = await this.pollCloudProjectCreationOperation(
        response.body.name /* LRO resource name */
      );
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
   * @return {Promise} this function returns a promise that resolves to the new cloud project
   *     information
   */
  private async pollCloudProjectCreationOperation(operationResourceName: string): Promise<any> {
    const pollerOptions: LroPollerOptions = {
      pollerName: "Project Creation Poller",
      apiOrigin: api.resourceManagerOrigin,
      apiVersion: "v1",
      operationResourceName,
    };
    const { error, response } = await this.poller.poll(pollerOptions);
    if (error) {
      throw error;
    }
    return response;
  }

  /**
   * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
   * to get the new Firebase project information.
   * @return {Promise} this function returns a promise that resolves to the new firebase project
   *    information
   */
  private async addFirebaseToCloudProject(projectId: string): Promise<any> {
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
      const projectInfo = await this.pollAddFirebaseToCloudProjectOperation(
        response.body.name /* LRO resource name */
      );
      spinner.succeed();
      return projectInfo; /* Operation resource name */
    } catch (err) {
      spinner.fail();
      logger.debug(err.message);
      throw new FirebaseError(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
        { exit: 2, original: err }
      );
    }
  }

  /**
   * @return {Promise} this function returns a promise that resolves to the new firebase project
   *    information
   */
  private async pollAddFirebaseToCloudProjectOperation(
    operationResourceName: string
  ): Promise<any> {
    const pollerOptions: LroPollerOptions = {
      pollerName: "Add Firebase Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName,
    };
    const { error, response } = await this.poller.poll(pollerOptions);
    if (error) {
      throw error;
    }
    return response;
  }
}
