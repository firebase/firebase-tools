import { capitalize, includes } from "lodash";
import { FetchError, Headers } from "node-fetch";
import { IncomingMessage, ServerResponse } from "http";
import { PassThrough } from "stream";
import { Request, RequestHandler, Response } from "express";
import { URL } from "url";

import { Client, HttpMethod } from "../apiv2";
import { FirebaseError } from "../error";
import { logger } from "../logger";

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
export function proxyRequestHandler(
  url: string,
  rewriteIdentifier: string,
  options: { forceCascade?: boolean } = {},
): RequestHandler {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<unknown> => {
    logger.info(`[hosting] Rewriting ${req.url} to ${url} for ${rewriteIdentifier}`);
    // Extract the __session cookie from headers to forward it to the
    // functions cookie is not a string[].
    const cookie = (req.headers.cookie as string) || "";
    const sessionCookie = cookie.split(/; ?/).find((c: string) => {
      return c.trim().startsWith("__session=");
    });

    // req.url is just the full path (e.g. /foo?key=value; no origin).
    const u = new URL(url + req.url);
    const c = new Client({ urlPrefix: u.origin, auth: false });

    let passThrough: PassThrough | undefined;
    if (req.method && !["GET", "HEAD"].includes(req.method)) {
      passThrough = new PassThrough();
      req.pipe(passThrough);
    }

    const headers = new Headers({
      "X-Forwarded-Host": req.headers.host || "",
      "X-Original-Url": req.url || "",
      Pragma: "no-cache",
      "Cache-Control": "no-cache, no-store",
      // forward the parsed __session cookie if any
      Cookie: sessionCookie || "",
    });
    // Skip particular header keys:
    // - using x-forwarded-host, don't need to keep `host` in the headers.
    const headersToSkip = new Set(["host"]);
    for (const key of Object.keys(req.headers)) {
      if (headersToSkip.has(key)) {
        continue;
      }
      const value = req.headers[key];
      if (value === undefined) {
        headers.delete(key);
      } else if (Array.isArray(value)) {
        headers.delete(key);
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }

    let proxyRes;
    try {
      proxyRes = await c.request<unknown, NodeJS.ReadableStream>({
        method: (req.method || "GET") as HttpMethod,
        path: u.pathname,
        queryParams: u.searchParams,
        headers,
        resolveOnHTTPError: true,
        responseType: "stream",
        redirect: "manual",
        body: passThrough,
        timeout: 60000,
        compress: false,
      });
    } catch (err: any) {
      const isAbortError =
        err instanceof FirebaseError && err.original?.name.includes("AbortError");
      const isTimeoutError =
        err instanceof FirebaseError &&
        err.original instanceof FetchError &&
        err.original.code === "ETIMEDOUT";
      const isSocketTimeoutError =
        err instanceof FirebaseError &&
        err.original instanceof FetchError &&
        err.original.code === "ESOCKETTIMEDOUT";
      if (isAbortError || isTimeoutError || isSocketTimeoutError) {
        res.statusCode = 504;
        return res.end("Timed out waiting for function to respond.\n");
      }
      res.statusCode = 500;
      return res.end(`An internal error occurred while proxying for ${rewriteIdentifier}\n`);
    }

    if (proxyRes.status === 404) {
      // x-cascade is not a string[].
      const cascade = proxyRes.response.headers.get("x-cascade");
      if (options.forceCascade || (cascade && cascade.toUpperCase() === "PASS")) {
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

    // Fix the location header that `node-fetch` attempts to helpfully fix:
    // https://github.com/node-fetch/node-fetch/blob/4abbfd231f4bce7dbe65e060a6323fc6917fd6d9/src/index.js#L117-L120
    // Filed a bug in `node-fetch` to either document the change or fix it:
    // https://github.com/node-fetch/node-fetch/issues/1086
    const location = proxyRes.response.headers.get("location");
    if (location) {
      // If parsing the URL fails, it may be because the location header
      // isn't a helpeful resolved URL (if node-fetch changes behavior). This
      // try is a preventative measure to ensure such a change shouldn't break
      // our emulator.
      try {
        const locationURL = new URL(location);
        // Only assume we can fix the location header if the origin of the
        // "fixed" header is the same as the origin of the outbound request.
        if (locationURL.origin === u.origin) {
          const unborkedLocation = location.replace(locationURL.origin, "");
          proxyRes.response.headers.set("location", unborkedLocation);
        }
      } catch (e: any) {
        logger.debug(
          `[hosting] had trouble parsing location header, but this may be okay: "${location}"`,
        );
      }
    }

    for (const [key, value] of Object.entries(proxyRes.response.headers.raw())) {
      res.setHeader(key, value as string[]);
    }
    res.statusCode = proxyRes.status;
    proxyRes.response.body.pipe(res);
  };
}

/**
 * Returns an Express RequestHandler that will both log out the error and
 * return an internal HTTP error response.
 */
export function errorRequestHandler(error: string): RequestHandler {
  return (req: Request, res: Response): any => {
    res.statusCode = 500;
    const out = `A problem occurred while trying to handle a proxied rewrite: ${error}`;
    logger.error(out);
    res.end(out);
  };
}
