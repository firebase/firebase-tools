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
  ): Promise<{ projectNumber: string; projectId: string }> {
    const cloudProjectCreationOperation = await this.createCloudProject(
      projectId,
      projectDisplayName,
      parentResource
    );
    const { projectNumber } = await this.pollCloudProjectCreationOperation(
      cloudProjectCreationOperation
    );
    const addFirebaseOperation = await this.addFirebaseToCloudProject(projectId);
    const projectData = await this.pollAddFirebaseToCloudProjectOperation(addFirebaseOperation);

    logger.info("");
    logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
    logger.info("");
    logger.info("Project information:");
    logger.info(`   - Project ID: ${clc.bold(projectData.projectId)}`);
    logger.info(`   - Project Name: ${clc.bold(projectData.displayName)}`);
    logger.info("");
    logger.info("Firebase console is available at");
    logger.info(`https://console.firebase.google.com/project/${clc.bold(projectId)}/overview`);
    return { projectNumber, projectId };
  }

  /**
   * @return {Promise} this function returns a promise that resolves to the resource name of the
   *     create cloud project LRO, or rejects if an error is thrown
   */
  private async createCloudProject(
    projectId: string,
    projectDisplayName: string,
    parentResource?: ParentResource
  ): Promise<string> {
    const spinner = new OraWrapper("Creating Google Cloud Platform project");
    spinner.start();

    try {
      const response = await api.request("POST", "/v1/projects", {
        auth: true,
        origin: api.resourceManagerOrigin,
        timeout: 15 * ONE_SECOND_MILLIS,
        data: { projectId, name: projectDisplayName, parent: parentResource },
      });
      spinner.succeed();
      return response.body.name; /* Operation resource name */
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
    const spinner = new OraWrapper("Waiting for project creation to be completed");
    spinner.start();

    try {
      const { error, response } = await this.poller.poll(pollerOptions);
      if (error) {
        throw error;
      }
      spinner.succeed();
      return response;
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
   * @return {Promise} this function returns a promise that resolves to the resource name of the add
   *     Firebase to cloud project LRO, or rejects if an error is thrown
   */
  private async addFirebaseToCloudProject(projectId: string): Promise<string> {
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
      spinner.succeed();
      return response.body.name; /* Operation resource name */
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
    const spinner = new OraWrapper("Waiting for project creation to be completed");
    spinner.start();

    try {
      const { error, response } = await this.poller.poll(pollerOptions);
      if (error) {
        throw error;
      }
      spinner.succeed();
      return response;
    } catch (err) {
      spinner.fail();
      logger.debug(err.message);
      throw new FirebaseError(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
        { exit: 2, original: err }
      );
    }
  }
}
