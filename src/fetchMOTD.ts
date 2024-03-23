import * as clc from "colorette";
import * as semver from "semver";

import { Client } from "./apiv2";
import { configstore } from "./configstore";
import { logger } from "./logger";
import { realtimeOrigin } from "./api";
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
      console.error(
        clc.red("Error:"),
        "CLI is out of date (on",
        clc.bold(pkg.version),
        ", need at least",
        clc.bold(motd.minVersion) + ")\n\nRun",
        clc.bold("npm install -g firebase-tools"),
        "to upgrade.",
      );
      process.exit(1);
    }

    if (motd.message && process.stdout.isTTY) {
      const lastMessage = configstore.get("motd.lastMessage");
      if (lastMessage !== motd.message) {
        console.log();
        console.log(motd.message);
        console.log();
        configstore.set("motd.lastMessage", motd.message);
      }
    }
  } else {
    const origin = utils.addSubdomain(realtimeOrigin, "firebase-public");
    const c = new Client({ urlPrefix: origin, auth: false });
    c.get("/cli.json")
      .then((res) => {
        motd = Object.assign({}, res.body);
        configstore.set("motd", motd);
        configstore.set("motd.fetched", Date.now());
      })
      .catch((err) => {
        utils.logWarning(
          "Unable to fetch the CLI MOTD and remote config. This is not a fatal error, but may indicate an issue with your network connection.",
        );
        logger.debug(`Failed to fetch MOTD ${err}`);
      });
  }
}
