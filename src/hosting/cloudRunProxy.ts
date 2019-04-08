import { Request, RequestHandler, Response } from "express";
import { capitalize, includes, get } from "lodash";
import * as request from "request";

import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import { request as apiRequest } from "../api";

export interface CloudRunProxyOptions {
  project?: string;
}

export interface CloudRunProxyRewrite {
  run: { serviceId: string; region?: string };
}

const REQUIRED_VARY_VALUES = ["Accept-Encoding", "Authorization", "Cookie"];

function makeVary(vary?: string): string {
  if (!vary) {
    return "Accept-Encoding, Authorization, Cookie";
  }

  const varies = vary.split(/, ?/).map((v) => {
    return v
      .split("-")
      .map((part) => capitalize(part))
      .join("-");
  });

  REQUIRED_VARY_VALUES.forEach((requiredVary) => {
    if (!includes(varies, requiredVary)) {
      varies.push(requiredVary);
    }
  });

  return varies.join(", ");
}

const cloudRunCache: { [s: string]: string } = {};

function getCloudRunUrl(rewrite: CloudRunProxyRewrite, projectId: string): Promise<string> {
  const alreadyFetched = cloudRunCache[`${rewrite.run.region}/${rewrite.run.serviceId}`];
  if (alreadyFetched) {
    return Promise.resolve(alreadyFetched);
  }

  const path = `/v1alpha1/projects/${projectId}/locations/${rewrite.run.region ||
    "us-central1"}/services/${rewrite.run.serviceId}`;
  const requestOptions = {
    origin: "https://run.googleapis.com",
    auth: true,
  };
  logger.info(`[hosting] Looking up Cloud Run service "${path}" for its URL`);
  return apiRequest("GET", path, requestOptions)
    .then((res) => {
      const url = get(res, "body.status.address.hostname");
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

function errorRequestHandler(error: string): RequestHandler {
  return (req: Request, res: Response, next: () => void): any => {
    res.statusCode = 500;
    const out = `A problem occured while trying to handle a Cloud Run rewrite: ${error}`;
    logger.error(out);
    res.end(out);
  };
}

function proxyRequestHandler(url: string, rewriteIdentifier: string): RequestHandler {
  return (req: Request, res: Response, next: () => void): any => {
    logger.info(`[hosting] Rewriting ${req.url} to ${url} for ${rewriteIdentifier}`);
    // Extract the __session cookie from headers to forward it to the
    // functions cookie is not a string[].
    const cookie = (req.headers.cookie as string) || "";
    const sessionCookie = cookie.split(/; ?/).find((c: string) => {
      return c.trim().indexOf("__session=") === 0;
    });

    const proxied = request({
      method: req.method,
      qs: req.query,
      url: url + req.url,
      headers: {
        "X-Forwarded-Host": req.headers.host,
        "X-Original-Url": req.url,
        Pragma: "no-cache",
        "Cache-Control": "no-cache, no-store",
        // forward the parsed __session cookie if any
        Cookie: sessionCookie,
      },
      followRedirect: false,
      timeout: 60000,
    });

    req.pipe(proxied);

    // err here is `any` in order to check `.code`
    proxied.on("error", (err: any) => {
      if (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT") {
        res.statusCode = 504;
        return res.end("Timed out waiting for function to respond.");
      }

      res.statusCode = 500;
      res.end(`An internal error occurred while proxying for ${rewriteIdentifier}`);
    });

    proxied.on("response", (response) => {
      if (response.statusCode === 404) {
        // x-cascade is not a string[].
        const cascade = response.headers["x-cascade"] as string;
        if (cascade && cascade.toUpperCase() === "PASS") {
          return next();
        }
      }

      // default to private cache
      if (!response.headers["cache-control"]) {
        response.headers["cache-control"] = "private";
      }

      // don't allow cookies to be set on non-private cached responses
      if (response.headers["cache-control"].indexOf("private") < 0) {
        delete response.headers["set-cookie"];
      }

      response.headers.vary = makeVary(response.headers.vary);

      proxied.pipe(res);
    });
  };
}

/**
 * Returns a function which, given a CloudRunProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to
 * the live Cloud Run service running within the given project.
 */
export default function(
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

    const textIdentifier = `Cloud Run service "${rewrite.run.serviceId}" for region "${
      rewrite.run.region
    }"`;
    return getCloudRunUrl(rewrite, getProjectId(options, false))
      .then((url) => proxyRequestHandler(url, textIdentifier))
      .catch(errorRequestHandler);
  };
}
