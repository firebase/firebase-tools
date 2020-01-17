import * as request from "request";
import * as logger from "../logger";
import * as utils from "../utils";
import { TemplateServerResponse } from "./implicitInit";
import { RequestHandler } from "express";
import { Request } from "request";

const SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;

/**
 * Initialize server middleware.
 * append firebase SDK js, and Content-Type header.
 * @param init Template server response.
 * @return Initialized middleware.
 */
export function initMiddleware(init: TemplateServerResponse): RequestHandler {
  return (req, res, next) => {
    const match = RegExp(SDK_PATH_REGEXP).exec(req.url);
    if (match) {
      const version = match[1];
      const sdkName = match[2];
      const url = "https://www.gstatic.com/firebasejs/" + version + "/" + sdkName;
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
