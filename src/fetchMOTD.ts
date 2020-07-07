import * as _ from "lodash";
import * as clc from "cli-color";
import * as request from "request";
import * as semver from "semver";

import { configstore } from "./configstore";
import * as api from "./api";
import * as logger from "./logger";
import * as utils from "./utils";

const pkg = require("../package.json"); // eslint-disable-line @typescript-eslint/no-var-requires

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Fetches the message of the day.
 */
export function fetchMOTD(): void {
  let motd = configstore.get("motd");
  const motdFetched = configstore.get("motd.fetched") || 0;

  if (motd && motdFetched > Date.now() - ONE_DAY_MS) {
    if (motd.minVersion && semver.gt(motd.minVersion, pkg.version)) {
      logger.error(
        clc.red("Error:"),
        "CLI is out of date (on",
        clc.bold(pkg.version),
        ", need at least",
        clc.bold(motd.minVersion) + ")\n\nRun",
        clc.bold("npm install -g firebase-tools"),
        "to upgrade."
      );
      process.exit(1);
    }

    if (motd.message && process.stdout.isTTY) {
      const lastMessage = configstore.get("motd.lastMessage");
      if (lastMessage !== motd.message) {
        logger.info();
        logger.info(motd.message);
        logger.info();
        configstore.set("motd.lastMessage", motd.message);
      }
    }
  } else {
    request(
      {
        url: utils.addSubdomain(api.realtimeOrigin, "firebase-public") + "/cli.json",
        json: true,
      },
      (err, res, body) => {
        if (err) {
          return;
        }
        motd = _.assign({}, body);
        configstore.set("motd", motd);
        configstore.set("motd.fetched", Date.now());
      }
    );
  }
}
