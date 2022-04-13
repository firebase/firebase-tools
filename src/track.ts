import * as ua from "universal-analytics";
import { v4 as uuidV4 } from "uuid";

import { configstore } from "./configstore";
const pkg = require("../package.json");

// The ID identifying the GA4 property for the Emulator Suite only. Should only
// be used in Emulator UI and emulator-related commands (e.g. emulators:start).
export const EMULATOR_GA4_MEASUREMENT_ID = "G-KYP2JMPFC0";

let _emulatorClientId: string | undefined = undefined;

// The identifier for the client for the Emulator Suite.
export function emulatorClientId(): string {
  if (!usageEnabled()) {
    return "";
  }
  if (_emulatorClientId) {
    return _emulatorClientId;
  }
  _emulatorClientId = configstore.get("emulator-analytics-clientId");
  if (!_emulatorClientId) {
    _emulatorClientId = uuidV4();
    configstore.set("emulator-analytics-clientId", _emulatorClientId);
  }
  return _emulatorClientId;
}

export function usageEnabled(): boolean {
  return !!configstore.get("usage");
}

// The Tracking ID for the Universal Analytics property for all of the CLI
// including emulator-related commands (double-tracked for historical reasons)
// but excluding Emulator UI.
// TODO: Upgrade to GA4 before July 1, 2023. See:
// https://support.google.com/analytics/answer/11583528
const FIREBASE_ANALYTICS_UA = "UA-29174744-3";

// Identifier for the client (UUID) in the CLI UA.
let anonId = configstore.get("analytics-uuid");
if (!anonId) {
  anonId = uuidV4();
  configstore.set("analytics-uuid", anonId);
}

const visitor = ua(process.env.FIREBASE_ANALYTICS_UA || FIREBASE_ANALYTICS_UA, anonId, {
  strictCidFormat: false,
  https: true,
});

visitor.set("cd1", process.platform); // Platform
visitor.set("cd2", process.version); // NodeVersion
visitor.set("cd3", process.env.FIREPIT_VERSION || "none"); // FirepitVersion

export function track(action: string, label: string, duration: number = 0): Promise<void> {
  return new Promise((resolve) => {
    if (configstore.get("tokens") && usageEnabled()) {
      visitor.event("Firebase CLI " + pkg.version, action, label, duration).send(() => {
        // we could handle errors here, but we won't
        resolve();
      });
    } else {
      resolve();
    }
  });
}
