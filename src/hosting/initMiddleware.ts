import * as request from "request";
import { Request } from "request";
import { RequestHandler } from "express";

import * as logger from "../logger";
import * as utils from "../utils";
import { TemplateServerResponse } from "./implicitInit";

const SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;

/**
 * Initialize server middleware. Returns a middleware set up to provide the
 * javascript and json objects at the well-known paths.
 * @param init template server response.
 * @return the middleware function.
 */
export function initMiddleware(init: TemplateServerResponse): RequestHandler {
  return (req, res, next) => {
    const match = RegExp(SDK_PATH_REGEXP).exec(req.url);
    if (match) {
      const version = match[1];
      const sdkName = match[2];
      const url = `https://www.gstatic.com/firebasejs/${version}/${sdkName}`;
      const preq: Request = request(url)
        .on("response", (pres) => {
          if (pres.statusCode === 404) {
            return next();
          }
          return preq.pipe(res);
        })
        .on("error", (e) => {
          utils.logLabeledWarning(
            "hosting",
            `Could not load Firebase SDK ${sdkName} v${version}, check your internet connection.`
          );
          logger.debug(e);
        });
    } else if (req.url === "/__/firebase/init.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(init.js);
    } else if (req.url === "/__/firebase/init.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(init.json);
    } else {
      next();
    }
  };
}
