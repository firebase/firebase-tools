import { IncomingMessage, ServerResponse } from "http";

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
export function initMiddleware(
  init: TemplateServerResponse,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
    const match = RegExp(SDK_PATH_REGEXP).exec(parsedUrl.pathname);
    if (match) {
      const version = match[1];
      const sdkName = match[2];
      const u = new URL(`https://www.gstatic.com/firebasejs/${version}/${sdkName}`);
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
            `Could not load Firebase SDK ${sdkName} v${version}, check your internet connection.`,
          );
          logger.debug(e);
        });
    } else if (parsedUrl.pathname === "/__/firebase/init.js") {
      // In theory we should be able to get this from req.query but for some
      // when testing this functionality, req.query and req.params were always
      // empty or undefined.
      const query = parsedUrl.searchParams;
      res.setHeader("Content-Type", "application/javascript");
      if (query.get("useEmulator") === "true") {
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
