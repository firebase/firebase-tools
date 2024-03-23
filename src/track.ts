import fetch from "node-fetch";
import * as ua from "universal-analytics";
import { v4 as uuidV4 } from "uuid";
import { getGlobalDefaultAccount } from "./auth";

import { configstore } from "./configstore";
import { logger } from "./logger";
const pkg = require("../package.json");

type cliEventNames =
  | "command_execution"
  | "product_deploy"
  | "error"
  | "login"
  | "api_enabled"
  | "hosting_version"
  | "extension_added_to_manifest"
  | "extensions_deploy"
  | "extensions_emulated"
  | "function_deploy"
  | "codebase_deploy"
  | "function_deploy_group";
type GA4Property = "cli" | "emulator";
interface GA4Info {
  measurementId: string;
  apiSecret: string;
  clientIdKey: string;
  currentSession?: AnalyticsSession;
}
export const GA4_PROPERTIES: Record<GA4Property, GA4Info> = {
  // Info for the GA4 property for the rest of the CLI.
  cli: {
    measurementId: process.env.FIREBASE_CLI_GA4_MEASUREMENT_ID || "G-PDN0QWHQJR",
    apiSecret: process.env.FIREBASE_CLI_GA4_API_SECRET || "LSw5lNxhSFSWeB6aIzJS2w",
    clientIdKey: "analytics-uuid",
  },
  // Info for the GA4 property for the Emulator Suite only. Should only
  // be used in Emulator UI and emulator-related commands (e.g. emulators:start).
  emulator: {
    measurementId: process.env.FIREBASE_EMULATOR_GA4_MEASUREMENT_ID || "G-KYP2JMPFC0",
    apiSecret: process.env.FIREBASE_EMULATOR_GA4_API_SECRET || "2V_zBYc4TdeoppzDaIu0zw",
    clientIdKey: "emulator-analytics-clientId",
  },
};
/**
 * UA is enabled only if:
 *   1) Entrypoint to the code is Firebase CLI (not require("firebase-tools")).
 *   2) User opted-in.
 */
export function usageEnabled(): boolean {
  return !!process.env.IS_FIREBASE_CLI && !!configstore.get("usage");
}

// Prop name length must <= 24 and cannot begin with google_/ga_/firebase_.
// https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=firebase#reserved_parameter_names
const GA4_USER_PROPS = {
  node_platform: {
    value: process.platform,
  },
  node_version: {
    value: process.version,
  },
  cli_version: {
    value: pkg.version,
  },
  firepit_version: {
    value: process.env.FIREPIT_VERSION || "none",
  },
};

export interface AnalyticsParams {
  /** The command running right now (param for custom dimension) */
  command_name?: string;

  /** The emulator related to the event (param for custom dimension) */
  emulator_name?: string;

  /** The number of times or objects (param for custom metrics) */
  count?: number;

  /** The elapsed time in milliseconds (e.g. for command runs) (param for custom metrics) */
  duration?: number;

  /** The result (success or error) of a command */
  result?: string;

  /** Whether the command was run in interactive or noninteractive mode */
  interactive?: string;
  /**
   * One-off params (that may be used for custom params / metrics later).
   *
   * Custom parameter names should be in snake_case. (Formal requirement:
   * length <= 40, alpha-numeric characters and underscores only (*no spaces*),
   * and must start with an alphabetic character.)
   *
   * If the value is a string, it must have length <= 100. For convenience, the
   * entire paramater is omitted (not sent to GA4) if value is set to undefined.
   */
  [key: string]: string | number | undefined;
}

export async function trackGA4(
  eventName: cliEventNames,
  params: AnalyticsParams,
  duration: number = 1, // Default to 1ms duration so that events show up in realtime view.
): Promise<void> {
  const session = cliSession();
  if (!session) {
    return;
  }
  return _ga4Track({
    session,
    apiSecret: GA4_PROPERTIES.cli.apiSecret,
    eventName,
    params,
    duration,
  });
}

/**
 * Record an emulator-related event for Analytics.
 *
 * @param eventName the event name in snake_case. (Formal requirement:
 *                  length <= 40, alpha-numeric characters and underscores only
 *                  (*no spaces*), and must start with an alphabetic character)
 * @param params custom and standard parameters attached to the event
 * @return a Promise fulfilled when the event reaches the server or fails
 *          (never rejects unless `emulatorSession().validateOnly` is set)
 *
 * Note: On performance or latency critical paths, the returned Promise may be
 * safely ignored with the statement `void trackEmulator(...)`.
 */
export async function trackEmulator(eventName: string, params?: AnalyticsParams): Promise<void> {
  const session = emulatorSession();
  if (!session) {
    return;
  }

  // Since there's no concept of foreground / active, we'll just assume users
  // are constantly engaging with the CLI since Node.js process started. (Yes,
  // staring at the terminal and waiting for the command to finish also counts.)
  const oldTotalEngagementSeconds = session.totalEngagementSeconds;
  session.totalEngagementSeconds = process.uptime();
  const duration = session.totalEngagementSeconds - oldTotalEngagementSeconds;
  return _ga4Track({
    session,
    apiSecret: GA4_PROPERTIES.emulator.apiSecret,
    eventName,
    params,
    duration,
  });
}

async function _ga4Track(args: {
  session: AnalyticsSession;
  apiSecret: string;
  eventName: string;
  params?: AnalyticsParams;
  duration?: number;
}): Promise<void> {
  const { session, apiSecret, eventName, params, duration } = args;

  // Memorize and set command_name throughout the session.
  session.commandName = params?.command_name || session.commandName;

  const search = `?api_secret=${apiSecret}&measurement_id=${session.measurementId}`;
  const validate = session.validateOnly ? "debug/" : "";
  const url = `https://www.google-analytics.com/${validate}mp/collect${search}`;
  const body = {
    // Get timestamp in millis and append '000' to get micros as string.
    // Not using multiplication due to JS number precision limit.
    timestamp_micros: `${Date.now()}000`,
    client_id: session.clientId,
    user_properties: {
      ...GA4_USER_PROPS,
      java_major_version: session.javaMajorVersion
        ? { value: session.javaMajorVersion }
        : undefined,
    },
    validationBehavior: session.validateOnly ? "ENFORCE_RECOMMENDATIONS" : undefined,
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
          engagement_time_msec: (duration ?? 0).toFixed(3).replace(".", "").replace(/^0+/, ""), // trim leading zeros

          // https://support.google.com/analytics/answer/7201382?hl=en
          // To turn debug mode off, `debug_mode` must be left out not `false`.
          debug_mode: session.debugMode ? true : undefined,
          command_name: session.commandName,
          ...params,
        },
      },
    ],
  };
  if (session.validateOnly) {
    logger.info(
      `Sending Analytics for event ${eventName} to property ${session.measurementId}`,
      params,
      body,
    );
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify(body),
    });
    if (session.validateOnly) {
      // If the validation endpoint is used, response may contain errors.
      if (!response.ok) {
        logger.warn(`Analytics validation HTTP error: ${response.status}`);
      }
      const respBody = await response.text();
      logger.info(`Analytics validation result: ${respBody}`);
    }
    // response.ok / response.status intentionally ignored, see comment below.
  } catch (e: unknown) {
    if (session.validateOnly) {
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

  // Whether the events sent should be tagged so that they are shown in GA Debug
  // View in real time (for Googler to debug) and excluded from reports.
  debugMode: boolean;

  // Whether to validate events format instead of collecting them. Should only
  // be used to debug the Firebase CLI / Emulator UI itself regarding issues
  // with Analytics. To enable, set the env var FIREBASE_CLI_MP_VALIDATE.
  // In the CLI, this is implemented by sending events to the GA4 measurement
  // validation API (which does not persist events) and printing the response.
  validateOnly: boolean;

  // The Java major version, if known. Will be attached to subsequent events.
  javaMajorVersion?: number;

  commandName?: string;
}

export function emulatorSession(): AnalyticsSession | undefined {
  return session("emulator");
}

export function cliSession(): AnalyticsSession | undefined {
  return session("cli");
}

function session(propertyName: GA4Property): AnalyticsSession | undefined {
  const validateOnly = !!process.env.FIREBASE_CLI_MP_VALIDATE;
  if (!usageEnabled()) {
    if (validateOnly) {
      logger.warn("Google Analytics is DISABLED. To enable, (re)login and opt in to collection.");
    }
    return;
  }
  const property = GA4_PROPERTIES[propertyName];
  if (!property.currentSession) {
    let clientId: string | undefined = configstore.get(property.clientIdKey);
    if (!clientId) {
      clientId = uuidV4();
      configstore.set(property.clientIdKey, clientId);
    }
    property.currentSession = {
      measurementId: property.measurementId,
      clientId,

      // This must be an int64 string, but only ~50 bits are generated here
      // for simplicity. (AFAICT, they just need to be unique per clientId,
      // instead of globally. Revisit if that is not the case.)
      // https://help.analyticsedge.com/article/misunderstood-metrics-sessions-in-google-analytics-4/#:~:text=The%20Session%20ID%20Is%20Not%20Unique
      sessionId: (Math.random() * Number.MAX_SAFE_INTEGER).toFixed(0),
      totalEngagementSeconds: 0,
      debugMode: isDebugMode(),
      validateOnly,
    };
  }
  return property.currentSession;
}

function isDebugMode(): boolean {
  const account = getGlobalDefaultAccount();
  if (account?.user.email.endsWith("@google.com")) {
    try {
      require("../tsconfig.json");
      logger.info(
        `Using Google Analytics in DEBUG mode. Emulators (+ UI) events will be shown in GA Debug View only.`,
      );
      return true;
    } catch {
      // The file above present in the repo but not packaged to npm. If require
      // fails, just turn off debug mode since the CLI is not in development.
    }
  }
  return false;
}

// The Tracking ID for the Universal Analytics property for all of the CLI
// including emulator-related commands (double-tracked for historical reasons)
// but excluding Emulator UI.
// TODO: Upgrade to GA4 before July 1, 2023. See:
// https://support.google.com/analytics/answer/11583528
const FIREBASE_ANALYTICS_UA = process.env.FIREBASE_ANALYTICS_UA || "UA-29174744-3";

let visitor: ua.Visitor;

function ensureUAVisitor(): void {
  if (!visitor) {
    // Identifier for the client (UUID) in the CLI UA.
    let anonId = configstore.get("analytics-uuid") as string;
    if (!anonId) {
      anonId = uuidV4();
      configstore.set("analytics-uuid", anonId);
    }

    visitor = ua(FIREBASE_ANALYTICS_UA, anonId, {
      strictCidFormat: false,
      https: true,
    });

    visitor.set("cd1", process.platform); // Platform
    visitor.set("cd2", process.version); // NodeVersion
    visitor.set("cd3", process.env.FIREPIT_VERSION || "none"); // FirepitVersion
  }
}

export function track(action: string, label: string, duration = 0): Promise<void> {
  ensureUAVisitor();
  return new Promise((resolve) => {
    if (usageEnabled() && configstore.get("tokens")) {
      visitor.event("Firebase CLI " + pkg.version, action, label, duration).send(() => {
        // we could handle errors here, but we won't
        resolve();
      });
    } else {
      resolve();
    }
  });
}
