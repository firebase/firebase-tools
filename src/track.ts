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
