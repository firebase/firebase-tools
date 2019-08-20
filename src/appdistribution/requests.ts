import * as _ from "lodash";
import * as api from "../api";
import * as utils from "../utils";
import { Distribution } from "./distribution";
import { FirebaseError } from "../error";

// tslint:disable-next-line:no-var-requires
const pkg = require("../../package.json");

/**
 * Proxies HTTPS requests to the App Distribution server backend.
 */
export class AppDistributionRequests {
  static MAX_POLLING_RETRIES = 30;
  static POLLING_INTERVAL_MS = 1000;

  constructor(private readonly appId: string) {
    this.appId = appId;
  }

  async provisionApp(): Promise<void> {
    await api.request("POST", `/v1alpha/apps/${this.appId}`, {
      origin: api.appDistributionOrigin,
      auth: true,
    });

    utils.logSuccess("provisioned for app distribution");
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

  async pollReleaseIdByHash(hash: string, retryCount = 0): Promise<any> {
    try {
      return await this.getReleaseIdByHash(hash);
    } catch (err) {
      if (retryCount >= AppDistributionRequests.MAX_POLLING_RETRIES) {
        throw new FirebaseError(`failed to find the uploaded release: ${err.message}`, { exit: 1 });
      }

      await new Promise((resolve) =>
        setTimeout(resolve, AppDistributionRequests.POLLING_INTERVAL_MS)
      );

      return this.pollReleaseIdByHash(hash, retryCount + 1);
    }
  }

  async getReleaseIdByHash(hash: string): Promise<string> {
    const apiResponse = await api.request(
      "GET",
      `/v1alpha/apps/${this.appId}/release_by_hash/${hash}`,
      {
        origin: api.appDistributionOrigin,
        auth: true,
      }
    );

    return _.get(apiResponse, "body.release.id");
  }

  async addReleaseNotes(releaseId: string, releaseNotes: string): Promise<void> {
    if (!releaseNotes) {
      utils.logWarning("no release notes specified, skipping");
      return Promise.resolve();
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
    testers: string[] = [],
    groups: string[] = []
  ): Promise<void> {
    if (!testers && !groups) {
      utils.logWarning("no testers or groups specified, skipping");
      return Promise.resolve();
    }

    utils.logBullet("adding testers/groups...");

    const data = {
      emails: testers,
      groupIds: groups,
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
