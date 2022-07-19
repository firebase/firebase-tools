import fetch from "node-fetch";
import * as ua from "universal-analytics";
import { v4 as uuidV4 } from "uuid";
import { getGlobalDefaultAccount } from "./auth";

import { configstore } from "./configstore";
import { logger } from "./logger";
const pkg = require("../package.json");

// The ID identifying the GA4 property for the Emulator Suite only. Should only
// be used in Emulator UI and emulator-related commands (e.g. emulators:start).
export const EMULATOR_GA4_MEASUREMENT_ID =
  process.env.FIREBASE_EMULATOR_GA4_MEASUREMENT_ID || "G-KYP2JMPFC0";

export function usageEnabled(): boolean {
  return !!configstore.get("usage");
}

// The Tracking ID for the Universal Analytics property for all of the CLI
// including emulator-related commands (double-tracked for historical reasons)
// but excluding Emulator UI.
// TODO: Upgrade to GA4 before July 1, 2023. See:
// https://support.google.com/analytics/answer/11583528
const FIREBASE_ANALYTICS_UA = process.env.FIREBASE_ANALYTICS_UA || "UA-29174744-3";

// Identifier for the client (UUID) in the CLI UA.
let anonId = configstore.get("analytics-uuid");
if (!anonId) {
  anonId = uuidV4();
  configstore.set("analytics-uuid", anonId);
}

const visitor = ua(FIREBASE_ANALYTICS_UA, anonId, {
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

const EMULATOR_GA4_API_SECRET =
  process.env.FIREBASE_EMULATOR_GA4_API_SECRET || "2V_zBYc4TdeoppzDaIu0zw";

// Whether to send all Analytics Measurement Protocol requests to the validation
// endpoint and log the result. Should only be used when debugging Firebase CLI
// itself regarding issues with Analytics.
const VALIDATE = !!process.env.FIREBASE_CLI_MP_VALIDATE;
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
  const session = emulatorSession();
  if (!session) {
    return;
  }

  // Since there's no concept of foreground / active, we'll just assume users
  // are constantly engaging with the CLI since Node.js process started. (Yes,
  // staring at the terminal and waiting for the command to finish also counts.)
  const oldTotalEngagementSeconds = session.totalEngagementSeconds;
  session.totalEngagementSeconds = process.uptime();

  const search = `?api_secret=${EMULATOR_GA4_API_SECRET}&measurement_id=${session.measurementId}`;
  const url = `https://www.google-analytics.com/${VALIDATE ? "debug/" : ""}mp/collect${search}`;
  const body = {
    // Get timestamp in millis and append '000' to get micros as string.
    // Not using multiplication due to JS number precision limit.
    timestamp_micros: `${Date.now()}000`,
    client_id: session.clientId,
    user_properties: EMULATOR_GA4_USER_PROPS,
    ...(VALIDATE ? { validationBehavior: "ENFORCE_RECOMMENDATIONS" } : {}),
    events: [
      {
        name: eventName,
        params: {
          session_id: session.sessionId,

          // engagement_time_msec and session_id must be set for the activity
          // to display in standard reports like Realtime.
          // https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#optional_parameters_for_reports

          // https://support.google.com/analytics/answer/11109416?hl=en
          // Additional engagement time since last event, in microseconds.
          engagement_time_msec: (session.totalEngagementSeconds - oldTotalEngagementSeconds)
            .toFixed(3)
            .replace(".", "")
            .replace(/^0+/, ""), // trim leading zeros

          // https://support.google.com/analytics/answer/7201382?hl=en
          // To turn debug mode off, `debug_mode` must be left out not `false`.
          ...(session.debugMode ? { debug_mode: true } : {}),
          ...params,
        },
      },
    ],
  };
  if (VALIDATE) {
    logger.info(`Sending Analytics for event ${eventName}`, params, body);
  }
  try {
    const response = await fetch(url, {
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

export interface AnalyticsSession {
  measurementId: string;
  clientId: string;

  // https://support.google.com/analytics/answer/9191807
  // We treat each CLI invocation as a different session, including any CLI
  // events and Emulator UI interactions.
  sessionId: string;
  totalEngagementSeconds: number;
  debugMode: boolean;
}

export function emulatorSession(): AnalyticsSession | undefined {
  if (!usageEnabled()) {
    if (VALIDATE) {
      logger.warn("Google Analytics is DISABLED. To enable, (re)login and opt in to collection.");
    }
    return;
  }
  if (!currentEmulatorSession) {
    let clientId: string | undefined = configstore.get("emulator-analytics-clientId");
    if (!clientId) {
      clientId = uuidV4();
      configstore.set("emulator-analytics-clientId", clientId);
    }

    currentEmulatorSession = {
      measurementId: EMULATOR_GA4_MEASUREMENT_ID,
      clientId,

      // This must be an int64 string, but only ~50 bits are generated here
      // for simplicity. (AFAICT, they just need to be unique per clientId,
      // instead of globally. Revisit if that is not the case.)
      // https://help.analyticsedge.com/article/misunderstood-metrics-sessions-in-google-analytics-4/#:~:text=The%20Session%20ID%20Is%20Not%20Unique
      sessionId: (Math.random() * Number.MAX_SAFE_INTEGER).toFixed(0),
      debugMode: isDebugMode(),
      totalEngagementSeconds: 0,
    };
  }
  return currentEmulatorSession;
}

let currentEmulatorSession: AnalyticsSession | undefined = undefined;

function isDebugMode(): boolean {
  const account = getGlobalDefaultAccount();
  if (account?.user.email.endsWith("@google.com")) {
    try {
      require("../tsconfig.json");
      logger.info(
        `Using Google Analytics in DEBUG mode. Emulators (+ UI) events will be shown in GA Debug View only.`
      );
      return true;
    } catch {
      // The file above present in the repo but not packaged to npm. If require
      // fails, just turn off debug mode since the CLI is not in development.
    }
  }
  return false;
}
