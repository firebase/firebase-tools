import fetch from "node-fetch";
import * as ua from "universal-analytics";
import { v4 as uuidV4 } from "uuid";

import { configstore } from "./configstore";
import { logger } from "./logger";
const pkg = require("../package.json");

// The ID identifying the GA4 property for the Emulator Suite only. Should only
// be used in Emulator UI and emulator-related commands (e.g. emulators:start).
export const EMULATOR_GA4_MEASUREMENT_ID = "G-KYP2JMPFC0";

let _emulatorClientId: string | undefined = undefined;
let _emulatorSessionId: string | undefined = undefined;

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

  // https://support.google.com/analytics/answer/9191807
  // We treat each CLI invocation as a different session, and therefore this is
  // not stored in configstore. The value may be an int64 string, but only ~50
  // bits are generated here for simplicity. (AFAICT, they just need to be
  // unique per clientId as opposed to globally. Revisit if that is not true.)
  // https://help.analyticsedge.com/article/misunderstood-metrics-sessions-in-google-analytics-4/#:~:text=The%20Session%20ID%20Is%20Not%20Unique
  _emulatorSessionId = (Math.random() * Number.MAX_SAFE_INTEGER).toFixed(0);

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

const EMULATOR_GA4_API_SECRET = "2V_zBYc4TdeoppzDaIu0zw";

// Whether to send all Analytics Measurement Protocol requests to the validation
// endpoint and log the result. Should only be used when debugging Firebase CLI
// itself regarding issues with Analytics.
const VALIDATE = !!process.env["FIREBASE_CLI_MP_VALIDATE"];
const EMULATOR_GA4_USER_PROPS = {
  node_platform: {
    value: process.platform,
  },
  node_version: {
    value: process.version,
  },
  firepit_version: {
    value: process.env.FIREPIT_VERSION || "none",
  },
};

/**
 * Record an emulator-related event for Analytics.
 *
 * @param eventName length <= 40, alpha-numeric characters and underscores only
 *                  (no spaces), and must start with an alphabetic character
 * @param params key: length <= 40, alpha-numeric characters and underscores
 *               only (no spaces), and must start with an alphabetic character.
 *               value: number or string with length <= 100
 * @returns a Promise fulfilled when the event reaches the server or fails
 *          (never rejects unless env var `FIREBASE_CLI_MP_VALIDATE` is set)
 *
 * Note: On performance or latency critical paths, the returned Promise may be
 * safely ignored with the statement `void trackEmulator(...)`.
 */
export async function trackEmulator(
  eventName: string,
  params?: Record<string, string | number>
): Promise<void> {
  if (!usageEnabled()) {
    return;
  }
  const debug = VALIDATE ? "debug/" : "";
  const search = `?api_secret=${EMULATOR_GA4_API_SECRET}&measurement_id=${EMULATOR_GA4_MEASUREMENT_ID}`;
  const client_id = emulatorClientId();
  const body = {
    // Get timestamp in millis and append '000' to get micros as string.
    // Not using multiplication due to JS number precision limit.
    timestamp_micros: `${Date.now()}000`,
    client_id: client_id,
    user_properties: EMULATOR_GA4_USER_PROPS,
    events: [
      {
        name: eventName,
        params: {
          // engagement_time_msec and session_id must be set for the activity
          // to display in standard reports like Realtime.
          // https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#optional_parameters_for_reports

          // https://support.google.com/analytics/answer/11109416?hl=en
          // Since there's no concept of foreground / active, we'll just report
          // time passed since the Node.js process for CLI has started. i.e.
          // Users are assumed to be constantly engaging. (Yes, staring at the
          // terminal and waiting for the command to finish also counts.)
          engagement_time_msec: process.uptime().toFixed(3).replace(".", ""),

          session_id: _emulatorSessionId!,
          ...params,
        },
      },
    ],
  };
  if (VALIDATE) {
    (body as { validationBehavior?: string }).validationBehavior = "ENFORCE_RECOMMENDATIONS";
  }
  try {
    const response = await fetch(`https://www.google-analytics.com/${debug}mp/collect${search}`, {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify(body),
    });
    if (VALIDATE) {
      // If the validation endpoint is used, response may contain errors.
      if (!response.ok) {
        logger.warn(`Analytics validation HTTP error: ${response.status}`);
      }
      const respBody = await response.text();
      logger.info(`Analytics validation result: ${respBody}`);
    }
    // response.ok / response.status intentionally ignored, see comment below.
  } catch (e: unknown) {
    if (VALIDATE) {
      throw e;
    }
    // Otherwise, we will ignore the status / error for these reasons:
    // * the endpoint always return 2xx even if request is malformed
    // * non-2xx requests should _not_ be retried according to documentation
    // * analytics is non-critical and should not fail other operations.
    // https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag#response_codes
    return;
  }
}
