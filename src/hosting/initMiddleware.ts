import * as request from "request";
import * as logger from "../logger";
import * as utils from "../utils";

const SDK_PATH_REGEXP = /^\/__\/firebase\/([^/]+)\/([^/]+)$/;

export function initMiddleware(init: any) {
  return (req: any, res: any, next: any) => {
    const match = req.url.match(SDK_PATH_REGEXP);
    if (match) {
      const version = match[1];
      const sdkName = match[2];
      const url = "https://www.gstatic.com/firebasejs/" + version + "/" + sdkName;
      const preq: any = request(url)
        .on("response", (pres: any) => {
          if (pres.statusCode === 404) {
            return next();
          }
          return preq.pipe(res);
        })
        .on("error", (e: any) => {
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
