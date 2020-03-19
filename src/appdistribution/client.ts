import * as _ from "lodash";
import * as api from "../api";
import * as utils from "../utils";
import { Distribution } from "./distribution";
import { FirebaseError } from "../error";

// tslint:disable-next-line:no-var-requires
const pkg = require("../../package.json");

/**
 * Helper interface for an app that is provisioned with App Distribution
 */
export interface AppDistributionApp {
  projectNumber: string;
  appId: string;
  platform: string;
  bundleId: string;
  contactEmail: string;
}

export enum UploadStatus {
  SUCCESS = "SUCCESS",
  IN_PROGRESS = "IN_PROGRESS",
  ERROR = "ERROR",
}

export interface UploadStatusResponse {
  status: UploadStatus;
  message: string;
  errorCode: string;
  release: {
    id: string;
  };
}

/**
 * Proxies HTTPS requests to the App Distribution server backend.
 */
export class AppDistributionClient {
  static MAX_POLLING_RETRIES = 30;
  static POLLING_INTERVAL_MS = 2000;

  constructor(private readonly appId: string) {}

  async getApp(): Promise<AppDistributionApp> {
    utils.logBullet("getting app details...");

    const apiResponse = await api.request("GET", `/v1alpha/apps/${this.appId}`, {
      origin: api.appDistributionOrigin,
      auth: true,
    });

    return _.get(apiResponse, "body");
  }

  async getJwtToken(): Promise<string> {
    const apiResponse = await api.request("GET", `/v1alpha/apps/${this.appId}/jwt`, {
      auth: true,
      origin: api.appDistributionOrigin,
    });

    return _.get(apiResponse, "body.token");
  }

  async uploadDistribution(token: string, distribution: Distribution): Promise<string> {
    const apiResponse = await api.request("POST", "/spi/v1/jwt_distributions", {
      origin: api.appDistributionUploadOrigin,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-APP-DISTRO-API-CLIENT-ID": pkg.name,
        "X-APP-DISTRO-API-CLIENT-TYPE": distribution.platform(),
        "X-APP-DISTRO-API-CLIENT-VERSION": pkg.version,
      },
      files: {
        file: {
          stream: distribution.readStream(),
          size: distribution.fileSize(),
          contentType: "multipart/form-data",
        },
      },
    });

    return _.get(apiResponse, "response.headers.etag");
  }

  async pollReleaseIdByHash(hash: string, retryCount = 0): Promise<string> {
    const uploadStatus = await this.getUploadStatus(hash);
    if (uploadStatus.status === UploadStatus.IN_PROGRESS) {
      if (retryCount >= AppDistributionClient.MAX_POLLING_RETRIES) {
        throw new FirebaseError(
          "it took longer than expected to process your binary, please try again",
          { exit: 1 }
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, AppDistributionClient.POLLING_INTERVAL_MS)
      );
      return this.pollReleaseIdByHash(hash, retryCount + 1);
    } else if (uploadStatus.status === UploadStatus.SUCCESS) {
      return uploadStatus.release.id;
    } else {
      throw new FirebaseError(
        `error processing your binary: ${uploadStatus.message} (Code: ${uploadStatus.errorCode})`
      );
    }
  }

  async getUploadStatus(hash: string): Promise<UploadStatusResponse> {
    const apiResponse = await api.request(
      "GET",
      `/v1alpha/apps/${this.appId}/upload_status/${hash}`,
      {
        origin: api.appDistributionOrigin,
        auth: true,
      }
    );

    return _.get(apiResponse, "body");
  }

  async addReleaseNotes(releaseId: string, releaseNotes: string): Promise<void> {
    if (!releaseNotes) {
      utils.logWarning("no release notes specified, skipping");
      return;
    }

    utils.logBullet("adding release notes...");

    const data = {
      releaseNotes: {
        releaseNotes,
      },
    };

    try {
      await api.request("POST", `/v1alpha/apps/${this.appId}/releases/${releaseId}/notes`, {
        origin: api.appDistributionOrigin,
        auth: true,
        data,
      });
    } catch (err) {
      throw new FirebaseError(`failed to add release notes with ${err.message}`, { exit: 1 });
    }

    utils.logSuccess("added release notes successfully");
  }

  async enableAccess(
    releaseId: string,
    emails: string[] = [],
    groupIds: string[] = []
  ): Promise<void> {
    if (emails.length === 0 && groupIds.length === 0) {
      utils.logWarning("no testers or groups specified, skipping");
      return;
    }

    utils.logBullet("adding testers/groups...");

    const data = {
      emails,
      groupIds,
    };

    try {
      await api.request("POST", `/v1alpha/apps/${this.appId}/releases/${releaseId}/enable_access`, {
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
      throw new FirebaseError(`failed to add testers/groups: ${errorMessage}`, { exit: 1 });
    }

    utils.logSuccess("added testers/groups successfully");
  }
}
