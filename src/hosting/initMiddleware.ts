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

import * as url from "url";
import * as qs from "querystring";
import { RequestHandler } from "express";

import { Client } from "../apiv2";
import { TemplateServerResponse } from "./implicitInit";
import { logger } from "../logger";
import * as utils from "../utils";

const SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;

/**
 * Initialize server middleware. Returns a middleware set up to provide the
 * javascript and json objects at the well-known paths.
 * @param init template server response.
 * @return the middleware function.
 */
export function initMiddleware(init: TemplateServerResponse): RequestHandler {
  return (req, res, next) => {
    const parsedUrl = url.parse(req.url);
    const match = RegExp(SDK_PATH_REGEXP).exec(req.url);
    if (match) {
      const version = match[1];
      const sdkName = match[2];
      const u = new url.URL(`https://www.gstatic.com/firebasejs/${version}/${sdkName}`);
      const c = new Client({ urlPrefix: u.origin, auth: false });
      const headers: { [key: string]: string } = {};
      const acceptEncoding = req.headers["accept-encoding"];
      if (typeof acceptEncoding === "string" && acceptEncoding) {
        headers["accept-encoding"] = acceptEncoding;
      }
      c.request<unknown, NodeJS.ReadableStream>({
        method: "GET",
        path: u.pathname,
        headers,
        responseType: "stream",
        resolveOnHTTPError: true,
        compress: false,
      })
        .then((sdkRes) => {
          if (sdkRes.status === 404) {
            return next();
          }
          for (const [key, value] of Object.entries(sdkRes.response.headers.raw())) {
            res.setHeader(key, value);
          }
          sdkRes.body.pipe(res);
        })
        .catch((e) => {
          utils.logLabeledWarning(
            "hosting",
            `Could not load Firebase SDK ${sdkName} v${version}, check your internet connection.`
          );
          logger.debug(e);
        });
    } else if (parsedUrl.pathname === "/__/firebase/init.js") {
      // In theory we should be able to get this from req.query but for some
      // when testing this functionality, req.query and req.params were always
      // empty or undefined.
      const query = qs.parse(parsedUrl.query || "");

      res.setHeader("Content-Type", "application/javascript");
      if (query["useEmulator"] === "true") {
        res.end(init.emulatorsJs);
      } else {
        res.end(init.js);
      }
    } else if (parsedUrl.pathname === "/__/firebase/init.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(init.json);
    } else {
      next();
    }
  };
}
