import { RequestHandler } from "express";
import { get } from "lodash";

import { errorRequestHandler, proxyRequestHandler } from "./proxy";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { cloudRunApiOrigin, request as apiRequest } from "../api";
import { Options } from "../options";

export interface CloudRunProxyOptions {
  project?: string;
}

export interface CloudRunProxyRewrite {
  run: {
    serviceId: string;
    region?: string;
  };
}

const cloudRunCache: { [s: string]: string } = {};

function getCloudRunUrl(rewrite: CloudRunProxyRewrite, projectId: string): Promise<string> {
  const alreadyFetched = cloudRunCache[`${rewrite.run.region}/${rewrite.run.serviceId}`];
  if (alreadyFetched) {
    return Promise.resolve(alreadyFetched);
  }

  const path = `/v1/projects/${projectId}/locations/${
    rewrite.run.region || "us-central1"
  }/services/${rewrite.run.serviceId}`;
  logger.info(`[hosting] Looking up Cloud Run service "${path}" for its URL`);
  return apiRequest("GET", path, { origin: cloudRunApiOrigin, auth: true })
    .then((res) => {
      const url = get(res, "body.status.url");
      if (!url) {
        return Promise.reject("Cloud Run URL doesn't exist in response.");
      }

      cloudRunCache[`${rewrite.run.region}/${rewrite.run.serviceId}`] = url;
      return url;
    })
    .catch((err) => {
      const errInfo = `error looking up URL for Cloud Run service: ${err}`;
      return Promise.reject(errInfo);
    });
}

/**
 * Returns a function which, given a CloudRunProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to
 * the live Cloud Run service running within the given project.
 */
export default function (
  options: CloudRunProxyOptions
): (r: CloudRunProxyRewrite) => Promise<RequestHandler> {
  return async (rewrite: CloudRunProxyRewrite) => {
    if (!rewrite.run) {
      // SuperStatic wouldn't send it here, but we should check
      return errorRequestHandler('Cloud Run rewrites must have a valid "run" field.');
    }
    if (!rewrite.run.serviceId) {
      return errorRequestHandler("Cloud Run rewrites must supply a service ID.");
    }
    if (!rewrite.run.region) {
      rewrite.run.region = "us-central1"; // Default region
    }
    logger.info(`[hosting] Cloud Run rewrite ${JSON.stringify(rewrite)} triggered`);

    const textIdentifier = `Cloud Run service "${rewrite.run.serviceId}" for region "${rewrite.run.region}"`;
    return getCloudRunUrl(rewrite, needProjectId(options))
      .then((url) => proxyRequestHandler(url, textIdentifier))
      .catch(errorRequestHandler);
  };
}
