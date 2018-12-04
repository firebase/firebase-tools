import { capitalize, includes } from "lodash";
import { Request, RequestHandler, Response } from "express";
import * as request from "request";

import * as getProjectId from "../getProjectId";
import * as logger from "../logger";

export interface FunctionsProxyOptions {
  port: number;
  project?: string;
  targets: string[];
}

export interface FunctionProxyRewrite {
  function: string;
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

/**
 * Returns a function which, given a FunctionProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to a
 * hosted or live function.
 */
export default function(
  options: FunctionsProxyOptions
): (r: FunctionProxyRewrite) => Promise<RequestHandler> {
  return async (rewrite: FunctionProxyRewrite) => {
    let url = `https://us-central1-${getProjectId(options, false)}.cloudfunctions.net/${
      rewrite.function
    }`;
    let destLabel = "live";
    if (includes(options.targets, "functions")) {
      destLabel = "local";
      url = `http://localhost:${options.port + 1}/${getProjectId(options, false)}/us-central1/${
        rewrite.function
      }`;
    }
    return await ((req: Request, res: Response, next: () => void): any => {
      logger.info(`[hosting] Rewriting ${req.url} to ${destLabel} function ${rewrite.function}`);
      // Extract the __session cookie from headers to forward it to the functions
      // cookie is not a string[].
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
        res.end(
          `An internal error occurred while connecting to Cloud Function "${rewrite.function}"`
        );
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
    });
  };
}
