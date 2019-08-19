import * as api from "../api";
import * as utils from "../utils";
import { Distribution } from "./distribution";

export class AppDistributionRequests {
  static MAX_POLLING_RETRIES = 30;
  static POLLING_INTERVAL_MS = 1000;

  mobilesdkAppId: string;

  constructor(mobilesdkAppId: string) {
    this.mobilesdkAppId = mobilesdkAppId;
  }

  async provisionApp(): Promise<void> {
    const provisionAppPath = "/v1alpha/apps/" + this.mobilesdkAppId;

    return api
      .request("POST", provisionAppPath, {
        origin: api.appDistributionOrigin,
        auth: true,
      })
      .then(() => {
        utils.logSuccess("Provisioned for app distribution");
      });
  }

  async getJwtToken(): Promise<string> {
    const jwtPath = "/v1alpha/apps/" + this.mobilesdkAppId + "/jwt";

    return api
      .request("GET", jwtPath, {
        auth: true,
        origin: api.appDistributionOrigin,
      })
      .then((response) => {
        return response.body.token;
      });
  }

  async uploadDistribution(token: string, distribution: Distribution): Promise<string> {
    const pkg = require("../../package.json");
    return api
      .request("POST", "/spi/v1/jwt_distributions", {
        origin: api.appDistributionUploadOrigin,
        headers: {
          Authorization: "Bearer " + token,
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
      })
      .then((response) => {
        return response.response.headers.etag;
      });
  }

  async pollReleaseIdByHash(hash: string, retryCount = 0): Promise<any> {
    return this.getReleaseIdByHash(hash).catch((err) => {
      if (retryCount >= AppDistributionRequests.MAX_POLLING_RETRIES) {
        return utils.reject("Failed to find the uploaded release: " + err.message, { exit: 1 });
      }

      return new Promise((resolve) =>
        setTimeout(resolve, AppDistributionRequests.POLLING_INTERVAL_MS)
      ).then(() => this.pollReleaseIdByHash(hash, retryCount + 1));
    });
  }

  async getReleaseIdByHash(hash: string): Promise<string> {
    const getReleasePath = "/v1alpha/apps/" + this.mobilesdkAppId + "/release_by_hash/" + hash;

    return api
      .request("GET", getReleasePath, {
        origin: api.appDistributionOrigin,
        auth: true,
      })
      .then((response) => response.body.release.id);
  }

  async addReleaseNotes(releaseId: string, releaseNotes: string): Promise<void> {
    if (!releaseNotes) {
      utils.logWarning("No release notes specified, skipping");
      return Promise.resolve();
    }

    utils.logBullet("Adding release notes...");

    const data = {
      releaseNotes: {
        releaseNotes,
      },
    };

    const releaseNotesPath =
      "/v1alpha/apps/" + this.mobilesdkAppId + "/releases/" + releaseId + "/notes";
    return api
      .request("POST", releaseNotesPath, {
        origin: api.appDistributionOrigin,
        auth: true,
        data,
      })
      .then(() => {
        utils.logSuccess("Added release notes successfully");
      })
      .catch((err) => {
        return utils.reject("Failed to add release notes with " + err.message, { exit: 1 });
      });
  }

  async enableAccess(releaseId: string, testers: string[], groups: string[]): Promise<void> {
    if (!testers && !groups) {
      utils.logWarning("No testers or groups specified, skipping");
      return Promise.resolve();
    }

    utils.logBullet("Adding testers/groups...");

    const data = {
      emails: testers,
      groupIds: groups,
    };

    const enableAccessPath =
      "/v1alpha/apps/" + this.mobilesdkAppId + "/releases/" + releaseId + "/enable_access";
    return api
      .request("POST", enableAccessPath, {
        origin: api.appDistributionOrigin,
        auth: true,
        data,
      })
      .then(() => {
        utils.logSuccess("Added testers/groups successfully");
      })
      .catch((err) => {
        let errorMessage = err.message;
        if (err.context && err.context.body && err.context.body.error) {
          const errorStatus = err.context.body.error.status;
          if (errorStatus === "FAILED_PRECONDITION") {
            errorMessage = "Invalid testers";
          } else if (errorStatus === "INVALID_ARGUMENT") {
            errorMessage = "Invalid groups";
          }
        }
        return utils.reject("Failed to add testers/groups. Details: " + errorMessage, { exit: 1 });
      });
  }
}
