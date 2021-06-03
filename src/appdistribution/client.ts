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
  aabState: AabState;
  aabCertificate: AabCertificate | null;
}

export interface AabCertificate {
  certificateHashMd5: string;
  certificateHashSha1: string;
  certificateHashSha256: string;
}

export enum UploadStatus {
  SUCCESS = "SUCCESS",
  IN_PROGRESS = "IN_PROGRESS",
  ERROR = "ERROR",
}

/** Enum representing the App Bundles state for the App */
export enum AabState {
  AAB_STATE_UNSPECIFIED = "AAB_STATE_UNSPECIFIED",
  ACTIVE = "ACTIVE",
  PLAY_ACCOUNT_NOT_LINKED = "PLAY_ACCOUNT_NOT_LINKED",
  NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT = "NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT",
  APP_NOT_PUBLISHED = "APP_NOT_PUBLISHED",
  AAB_STATE_UNAVAILABLE = "AAB_STATE_UNAVAILABLE",
  PLAY_IAS_TERMS_NOT_ACCEPTED = "PLAY_IAS_TERMS_NOT_ACCEPTED",
}

export interface UploadStatusResponse {
  status: UploadStatus;
  message: string;
  errorCode: string;
  release: {
    id: string;
  };
}

/** Enum for app_view parameter for getApp requests */
export enum AppView {
  BASIC = "BASIC",
  FULL = "FULL",
}

/**
 * Proxies HTTPS requests to the App Distribution server backend.
 */
export class AppDistributionClient {
  static MAX_POLLING_RETRIES = 60;
  static POLLING_INTERVAL_MS = 2000;

  constructor(private readonly appId: string) {}

  async getApp(appView = AppView.BASIC): Promise<AppDistributionApp> {
    const apiResponse = await api.request("GET", `/v1alpha/apps/${this.appId}?appView=${appView}`, {
      origin: api.appDistributionOrigin,
      auth: true,
    });

    return _.get(apiResponse, "body");
  }

  async uploadDistribution(distribution: Distribution): Promise<string> {
    const apiResponse = await api.request("POST", `/app-binary-uploads?app_id=${this.appId}`, {
      auth: true,
      origin: api.appDistributionOrigin,
      headers: {
        "X-APP-DISTRO-API-CLIENT-ID": pkg.name,
        "X-APP-DISTRO-API-CLIENT-TYPE": distribution.platform(),
        "X-APP-DISTRO-API-CLIENT-VERSION": pkg.version,
        "X-GOOG-UPLOAD-FILE-NAME": distribution.getFileName(),
        "X-GOOG-UPLOAD-PROTOCOL": "raw",
        "Content-Type": "application/octet-stream",
      },
      data: distribution.readStream(),
      json: false,
    });

    return _.get(JSON.parse(apiResponse.body), "token");
  }

  async pollUploadStatus(binaryName: string, retryCount = 0): Promise<string> {
    const uploadStatus = await this.getUploadStatus(binaryName);
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
      return this.pollUploadStatus(binaryName, retryCount + 1);
    } else if (uploadStatus.status === UploadStatus.SUCCESS) {
      return uploadStatus.release.id;
    } else {
      throw new FirebaseError(
        `error processing your binary: ${uploadStatus.message} (Code: ${uploadStatus.errorCode})`
      );
    }
  }

  async getUploadStatus(binaryName: string): Promise<UploadStatusResponse> {
    const encodedBinaryName = encodeURIComponent(binaryName);
    const apiResponse = await api.request(
      "GET",
      `/v1alpha/apps/${this.appId}/upload_status/${encodedBinaryName}`,
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
