/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { RequestHandler } from "express";

import { Client } from "../apiv2";
import { cloudRunApiOrigin } from "../api";
import { errorRequestHandler, proxyRequestHandler } from "./proxy";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";

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

const apiClient = new Client({ urlPrefix: cloudRunApiOrigin, apiVersion: "v1" });

async function getCloudRunUrl(rewrite: CloudRunProxyRewrite, projectId: string): Promise<string> {
  const alreadyFetched = cloudRunCache[`${rewrite.run.region}/${rewrite.run.serviceId}`];
  if (alreadyFetched) {
    return Promise.resolve(alreadyFetched);
  }

  const path = `/projects/${projectId}/locations/${rewrite.run.region || "us-central1"}/services/${
    rewrite.run.serviceId
  }`;
  try {
    logger.info(`[hosting] Looking up Cloud Run service "${path}" for its URL`);
    const res = await apiClient.get<{ status?: { url?: string } }>(path);
    const url = res.body.status?.url;
    if (!url) {
      throw new FirebaseError("Cloud Run URL doesn't exist in response.");
    }

    cloudRunCache[`${rewrite.run.region}/${rewrite.run.serviceId}`] = url;
    return url;
  } catch (err: any) {
    throw new FirebaseError(`Error looking up URL for Cloud Run service: ${err}`, {
      original: err,
    });
  }
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
