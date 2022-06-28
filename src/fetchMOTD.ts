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

import * as clc from "cli-color";
import * as semver from "semver";

import { Client } from "./apiv2";
import { configstore } from "./configstore";
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
        "to upgrade."
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
    c.get("/cli.json").then((res) => {
      motd = Object.assign({}, res.body);
      configstore.set("motd", motd);
      configstore.set("motd.fetched", Date.now());
    });
  }
}
