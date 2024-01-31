import { ReadStream } from "fs";

import * as utils from "../utils";
import * as operationPoller from "../operation-poller";
import { Distribution } from "./distribution";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { appDistributionOrigin } from "../api";

/**
 * Helper interface for an app that is provisioned with App Distribution
 */
export interface AabInfo {
  name: string;
  integrationState: IntegrationState;
  testCertificate: TestCertificate | null;
}

export interface TestCertificate {
  hashSha1: string;
  hashSha256: string;
  hashMd5: string;
}

/** Enum representing the App Bundles state for the App */
export enum IntegrationState {
  AAB_INTEGRATION_STATE_UNSPECIFIED = "AAB_INTEGRATION_STATE_UNSPECIFIED",
  INTEGRATED = "INTEGRATED",
  PLAY_ACCOUNT_NOT_LINKED = "PLAY_ACCOUNT_NOT_LINKED",
  NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT = "NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT",
  APP_NOT_PUBLISHED = "APP_NOT_PUBLISHED",
  AAB_STATE_UNAVAILABLE = "AAB_STATE_UNAVAILABLE",
  PLAY_IAS_TERMS_NOT_ACCEPTED = "PLAY_IAS_TERMS_NOT_ACCEPTED",
}

export enum UploadReleaseResult {
  UPLOAD_RELEASE_RESULT_UNSPECIFIED = "UPLOAD_RELEASE_RESULT_UNSPECIFIED",
  RELEASE_CREATED = "RELEASE_CREATED",
  RELEASE_UPDATED = "RELEASE_UPDATED",
  RELEASE_UNMODIFIED = "RELEASE_UNMODIFIED",
}

export interface Release {
  name: string;
  releaseNotes: ReleaseNotes;
  displayVersion: string;
  buildVersion: string;
  createTime: Date;
  firebaseConsoleUri: string;
  testingUri: string;
  binaryDownloadUri: string;
}

export interface ReleaseNotes {
  text: string;
}

export interface UploadReleaseResponse {
  result: UploadReleaseResult;
  release: Release;
}

export interface BatchRemoveTestersResponse {
  emails: string[];
}

export interface Group {
  name: string;
  displayName: string;
  testerCount?: number;
  releaseCount?: number;
  inviteLinkCount?: number;
}

/**
 * Makes RPCs to the App Distribution server backend.
 */
export class AppDistributionClient {
  appDistroV2Client = new Client({
    urlPrefix: appDistributionOrigin,
    apiVersion: "v1",
  });

  async getAabInfo(appName: string): Promise<AabInfo> {
    const apiResponse = await this.appDistroV2Client.get<AabInfo>(`/${appName}/aabInfo`);
    return apiResponse.body;
  }

  async uploadRelease(appName: string, distribution: Distribution): Promise<string> {
    const client = new Client({ urlPrefix: appDistributionOrigin });
    const apiResponse = await client.request<ReadStream, { name: string }>({
      method: "POST",
      path: `/upload/v1/${appName}/releases:upload`,
      headers: {
        "X-Goog-Upload-File-Name": encodeURIComponent(distribution.getFileName()),
        "X-Goog-Upload-Protocol": "raw",
        "Content-Type": "application/octet-stream",
      },
      responseType: "json",
      body: distribution.readStream(),
    });
    return apiResponse.body.name;
  }

  async pollUploadStatus(operationName: string): Promise<UploadReleaseResponse> {
    return operationPoller.pollOperation<UploadReleaseResponse>({
      pollerName: "App Distribution Upload Poller",
      apiOrigin: appDistributionOrigin,
      apiVersion: "v1",
      operationResourceName: operationName,
      masterTimeout: 5 * 60 * 1000,
      backoff: 1000,
      maxBackoff: 10 * 1000,
    });
  }

  async updateReleaseNotes(releaseName: string, releaseNotes: string): Promise<void> {
    if (!releaseNotes) {
      utils.logWarning("no release notes specified, skipping");
      return;
    }

    utils.logBullet("updating release notes...");

    const data = {
      name: releaseName,
      releaseNotes: {
        text: releaseNotes,
      },
    };
    const queryParams = { updateMask: "release_notes.text" };

    try {
      await this.appDistroV2Client.patch(`/${releaseName}`, data, { queryParams });
    } catch (err: any) {
      throw new FirebaseError(`failed to update release notes with ${err?.message}`);
    }

    utils.logSuccess("added release notes successfully");
  }

  async distribute(
    releaseName: string,
    testerEmails: string[] = [],
    groupAliases: string[] = [],
  ): Promise<void> {
    if (testerEmails.length === 0 && groupAliases.length === 0) {
      utils.logWarning("no testers or groups specified, skipping");
      return;
    }

    utils.logBullet("distributing to testers/groups...");

    const data = {
      testerEmails,
      groupAliases,
    };

    try {
      await this.appDistroV2Client.post(`/${releaseName}:distribute`, data);
    } catch (err: any) {
      let errorMessage = err.message;
      const errorStatus = err?.context?.body?.error?.status;
      if (errorStatus === "FAILED_PRECONDITION") {
        errorMessage = "invalid testers";
      } else if (errorStatus === "INVALID_ARGUMENT") {
        errorMessage = "invalid groups";
      }
      throw new FirebaseError(`failed to distribute to testers/groups: ${errorMessage}`, {
        exit: 1,
      });
    }

    utils.logSuccess("distributed to testers/groups successfully");
  }

  async addTesters(projectName: string, emails: string[]): Promise<void> {
    try {
      await this.appDistroV2Client.request({
        method: "POST",
        path: `${projectName}/testers:batchAdd`,
        body: { emails: emails },
      });
    } catch (err: any) {
      throw new FirebaseError(`Failed to add testers ${err}`);
    }

    utils.logSuccess(`Testers created successfully`);
  }

  async removeTesters(projectName: string, emails: string[]): Promise<BatchRemoveTestersResponse> {
    let apiResponse;
    try {
      apiResponse = await this.appDistroV2Client.request<
        { emails: string[] },
        BatchRemoveTestersResponse
      >({
        method: "POST",
        path: `${projectName}/testers:batchRemove`,
        body: { emails: emails },
      });
    } catch (err: any) {
      throw new FirebaseError(`Failed to remove testers ${err}`);
    }
    return apiResponse.body;
  }

  async createGroup(projectName: string, displayName: string, alias?: string): Promise<Group> {
    let apiResponse;
    try {
      apiResponse = await this.appDistroV2Client.request<{ displayName: string }, Group>({
        method: "POST",
        path:
          alias === undefined ? `${projectName}/groups` : `${projectName}/groups?groupId=${alias}`,
        body: { displayName: displayName },
      });
    } catch (err: any) {
      throw new FirebaseError(`Failed to create group ${err}`);
    }
    return apiResponse.body;
  }

  async deleteGroup(groupName: string): Promise<void> {
    try {
      await this.appDistroV2Client.request({
        method: "DELETE",
        path: groupName,
      });
    } catch (err: any) {
      throw new FirebaseError(`Failed to delete group ${err}`);
    }

    utils.logSuccess(`Group deleted successfully`);
  }

  async addTestersToGroup(groupName: string, emails: string[]): Promise<void> {
    try {
      await this.appDistroV2Client.request({
        method: "POST",
        path: `${groupName}:batchJoin`,
        body: { emails: emails },
      });
    } catch (err: any) {
      throw new FirebaseError(`Failed to add testers to group ${err}`);
    }

    utils.logSuccess(`Testers added to group successfully`);
  }

  async removeTestersFromGroup(groupName: string, emails: string[]): Promise<void> {
    try {
      await this.appDistroV2Client.request({
        method: "POST",
        path: `${groupName}:batchLeave`,
        body: { emails: emails },
      });
    } catch (err: any) {
      throw new FirebaseError(`Failed to remove testers from group ${err}`);
    }

    utils.logSuccess(`Testers removed from group successfully`);
  }
}
