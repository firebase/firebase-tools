import ua from "universal-analytics";

import _ from "lodash";
import { configstore } from "./configstore";
import uuid from "uuid";
import { logger } from "./logger";
const pkg = require("../package.json");

var anonId = configstore.get("analytics-uuid");
if (!anonId) {
  anonId = uuid.v4();
  configstore.set("analytics-uuid", anonId);
}

var visitor = ua(process.env.FIREBASE_ANALYTICS_UA || "UA-29174744-3", anonId, {
  strictCidFormat: false,
  https: true,
});

visitor.set("cd1", process.platform); // Platform
visitor.set("cd2", process.version); // NodeVersion
visitor.set("cd3", process.env.FIREPIT_VERSION || "none"); // FirepitVersion

export function track(action: string, label: string, duration: number = 0): Promise<void> {
  return new Promise(function (resolve) {
    if (!_.isString(action) || !_.isString(label)) {
      logger.debug("track received non-string arguments:", action, label);
      resolve();
    }

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

// New code should import track by name so that it can be stubbed
// in unit tests. Legacy code still imports as default.
export default track;
