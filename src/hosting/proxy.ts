import { capitalize, includes } from "lodash";
import { Request, RequestHandler, Response } from "express";
import { URL } from "url";
import AbortController from "abort-controller";
import { ServerResponse } from "http";

import { Client, HttpMethod } from "../apiv2";
import * as logger from "../logger";
import { FirebaseError } from "../error";

const REQUIRED_VARY_VALUES = ["Accept-Encoding", "Authorization", "Cookie"];

function makeVary(vary: string | null = ""): string {
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
 * Returns an Express RequestHandler that will proxy the given request to a new
 * URL. Provide a rewriteIdentifier to help identify what triggered the proxy
 * when writing out logs or errors.  This makes some minor changes to headers,
 * cookies, and caching similar to the behavior of the production version of
 * the Firebase Hosting origin.
 */
export function proxyRequestHandler(url: string, rewriteIdentifier: string): RequestHandler {
  return (req: Request, res: ServerResponse, next: () => void): any => {
    logger.info(`[hosting] Rewriting ${req.url} to ${url} for ${rewriteIdentifier}`);
    // Extract the __session cookie from headers to forward it to the
    // functions cookie is not a string[].
    const cookie = (req.headers.cookie as string) || "";
    const sessionCookie = cookie.split(/; ?/).find((c: string) => {
      return c.trim().startsWith("__session=");
    });

    const u = new URL(url + req.url);
    const c = new Client({ urlPrefix: u.origin, auth: false });
    const controller = new AbortController();
    const timer = setTimeout(controller.abort.bind(controller), 1000);

    c.request<unknown, NodeJS.ReadableStream>({
      method: req.method as HttpMethod,
      path: u.pathname,
      queryParams: req.query as { [key: string]: string },
      headers: {
        "X-Forwarded-Host": req.headers.host || "",
        "X-Original-Url": req.url,
        Pragma: "no-cache",
        "Cache-Control": "no-cache, no-store",
        // forward the parsed __session cookie if any
        Cookie: sessionCookie || "",
      },
      resolveOnHTTPError: true,
      responseType: "stream",
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      signal: controller.signal,
    })
      .then((proxyRes) => {
        clearTimeout(timer);
        if (proxyRes.status === 404) {
          // x-cascade is not a string[].
          const cascade = proxyRes.response.headers.get("x-cascade");
          if (cascade && cascade.toUpperCase() === "PASS") {
            return next();
          }
        }

        // default to private cache
        if (!proxyRes.response.headers.get("cache-control")) {
          proxyRes.response.headers.set("cache-control", "private");
        }

        // don't allow cookies to be set on non-private cached responses
        const cc = proxyRes.response.headers.get("cache-control");
        if (cc && !cc.includes("private")) {
          proxyRes.response.headers.delete("set-cookie");
        }

        proxyRes.response.headers.set("vary", makeVary(proxyRes.response.headers.get("vary")));

        proxyRes.body.pipe(res);
      })
      .catch((err) => {
        console.error(res instanceof ServerResponse);
        console.error("error", err);
        clearTimeout(timer);
        const isAbortError =
          err instanceof FirebaseError && err.original?.name.includes("AbortError");
        console.error("abort", isAbortError);
        if (isAbortError || err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT") {
          res.statusCode = 504;
          return res.end("Timed out waiting for function to respond.");
        }

        console.error("OTHER ERROR");
        res.statusCode = 500;
        res.end(`An internal error occurred while proxying for ${rewriteIdentifier}`);
      });
  };
}

/**
 * Returns an Express RequestHandler that will both log out the error and
 * return an internal HTTP error response.
 */
export function errorRequestHandler(error: string): RequestHandler {
  return (req: Request, res: Response, next: () => void): any => {
    res.statusCode = 500;
    const out = `A problem occurred while trying to handle a proxied rewrite: ${error}`;
    logger.error(out);
    res.end(out);
  };
}
