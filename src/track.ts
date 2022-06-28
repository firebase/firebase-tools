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

import * as ua from "universal-analytics";
import { v4 as uuidV4 } from "uuid";

import { configstore } from "./configstore";
const pkg = require("../package.json");

let anonId = configstore.get("analytics-uuid");
if (!anonId) {
  anonId = uuidV4();
  configstore.set("analytics-uuid", anonId);
}

const visitor = ua(process.env.FIREBASE_ANALYTICS_UA || "UA-29174744-3", anonId, {
  strictCidFormat: false,
  https: true,
});

visitor.set("cd1", process.platform); // Platform
visitor.set("cd2", process.version); // NodeVersion
visitor.set("cd3", process.env.FIREPIT_VERSION || "none"); // FirepitVersion

export function track(action: string, label: string, duration: number = 0): Promise<void> {
  return new Promise((resolve) => {
    if (configstore.get("tokens") && configstore.get("usage")) {
      visitor.event("Firebase CLI " + pkg.version, action, label, duration).send(() => {
        // we could handle errors here, but we won't
        resolve();
      });
    } else {
      resolve();
    }
  });
}
