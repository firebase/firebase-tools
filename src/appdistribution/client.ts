import * as _ from "lodash";
import * as api from "../api";
import * as utils from "../utils";
import * as operationPoller from "../operation-poller";
import { Distribution } from "./distribution";
import { FirebaseError } from "../error";
import { Client, ClientResponse } from "../apiv2";

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

/**
 * Makes RPCs to the App Distribution server backend.
 */
export class AppDistributionClient {
  appDistroV2Client = new Client({
    urlPrefix: api.appDistributionOrigin,
    apiVersion: "v1",
  });

  async getAabInfo(appName: string): Promise<AabInfo> {
    const apiResponse = await api.request("GET", `/v1/${appName}/aabInfo`, {
      origin: api.appDistributionOrigin,
      auth: true,
    });

    return _.get(apiResponse, "body");
  }

  async uploadRelease(appName: string, distribution: Distribution): Promise<string> {
    const apiResponse = await api.request("POST", `/upload/v1/${appName}/releases:upload`, {
      auth: true,
      origin: api.appDistributionOrigin,
      headers: {
        "X-Goog-Upload-File-Name": distribution.getFileName(),
        "X-Goog-Upload-Protocol": "raw",
        "Content-Type": "application/octet-stream",
      },
      data: distribution.readStream(),
      json: false,
    });

    return _.get(JSON.parse(apiResponse.body), "name");
  }

  async pollUploadStatus(operationName: string): Promise<UploadReleaseResponse> {
    return operationPoller.pollOperation<UploadReleaseResponse>({
      pollerName: "App Distribution Upload Poller",
      apiOrigin: api.appDistributionOrigin,
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

    try {
      await api.request("PATCH", `/v1/${releaseName}?updateMask=release_notes.text`, {
        origin: api.appDistributionOrigin,
        auth: true,
        data,
      });
    } catch (err) {
      throw new FirebaseError(`failed to update release notes with ${err.message}`, { exit: 1 });
    }

    utils.logSuccess("added release notes successfully");
  }

  async distribute(
    releaseName: string,
    testerEmails: string[] = [],
    groupAliases: string[] = []
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
      await api.request("POST", `/v1/${releaseName}:distribute`, {
        origin: api.appDistributionOrigin,
        auth: true,
        data,
      });
    } catch (err) {
      let errorMessage = err.message;
      if (_.has(err, "context.body.error")) {
        const errorStatus = _.get(err, "context.body.error.status");
        if (errorStatus === "FAILED_PRECONDITION") {
          errorMessage = "invalid testers";
        } else if (errorStatus === "INVALID_ARGUMENT") {
          errorMessage = "invalid groups";
        }
      }
      throw new FirebaseError(`failed to distribute to testers/groups: ${errorMessage}`, {
        exit: 1,
      });
    }

    utils.logSuccess("distributed to testers/groups successfully");
  }

  async addTesters(projectName: string, emails: string[]) {
    try {
      await this.appDistroV2Client.request({
        method: "POST",
        path: `${projectName}/testers:batchAdd`,
        body: { emails: emails },
      });
    } catch (err) {
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
    } catch (err) {
      throw new FirebaseError(`Failed to remove testers ${err}`);
    }
    return apiResponse.body;
  }
}
