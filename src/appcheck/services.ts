import { FirebaseError } from "../error";
import { EnforcementMode, Service } from "./types";

/**
 * Short names for the services App Check can protect, mapped to the service ids
 * the API uses.
 *
 * Nobody can guess these ids, so the aliases are what we document and what the
 * error messages list. A full service id is still accepted, which is also how
 * the services the CLI has no alias for (Google Maps, Google Identity for iOS)
 * stay reachable.
 *
 * `ailogic` maps to `firebaseml.googleapis.com`, which looks wrong because
 * Firebase ML is a different product and AI Logic talks to
 * `firebasevertexai.googleapis.com`. It is right: an App Check service id names
 * a service to App Check and is not the API host, as the API reference says
 * itself. `firebasevertexai.googleapis.com` is rejected with "Service not
 * supported", and `firebaseml.googleapis.com` is what the API reference labels
 * Firebase AI Logic and what Firebase auto enforces on AI Logic projects.
 */
export const SERVICE_ALIAS_TO_ID: Readonly<Record<string, string>> = {
  auth: "identitytoolkit.googleapis.com",
  firestore: "firestore.googleapis.com",
  database: "firebasedatabase.googleapis.com",
  storage: "firebasestorage.googleapis.com",
  ailogic: "firebaseml.googleapis.com",
  dataconnect: "firebasedataconnect.googleapis.com",
};

const SERVICE_ID_TO_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_ALIAS_TO_ID).map(([alias, id]) => [id, alias]),
);

/**
 * Product names as the App Check documentation writes them.
 *
 * These are what we show. The service ids are an implementation detail of the
 * API, and a couple of them are actively confusing: AI Logic is identified as
 * `firebaseml.googleapis.com`, which is a different product's name. Developers
 * should read "Firebase AI Logic" and type `ailogic`, and never have to care.
 */
const SERVICE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "identitytoolkit.googleapis.com": "Firebase Authentication",
  "firestore.googleapis.com": "Cloud Firestore",
  "firebasedatabase.googleapis.com": "Firebase Realtime Database",
  "firebasestorage.googleapis.com": "Cloud Storage for Firebase",
  "firebaseml.googleapis.com": "Firebase AI Logic",
  "firebasedataconnect.googleapis.com": "Firebase SQL Connect",
  "maps-backend.googleapis.com": "Maps JavaScript API",
  "places.googleapis.com": "Places API (New)",
  "oauth2.googleapis.com": "Google Identity for iOS",
};

/** The product name for a service id, or the id when we have no name for it. */
export function displayNameForServiceId(serviceId: string): string {
  return SERVICE_DISPLAY_NAMES[serviceId] ?? serviceId;
}

/**
 * Service ids the API accepts but that are not Firebase products, so they get
 * no alias. Listed here only so a full id passes validation instead of being
 * rejected by the CLI before the API can answer.
 */
const OTHER_SUPPORTED_SERVICE_IDS: ReadonlySet<string> = new Set([
  "maps-backend.googleapis.com",
  "places.googleapis.com",
  "oauth2.googleapis.com",
]);

/**
 * Firebase turns App Check on for these services by default, so relaxing them
 * is the risky direction and the CLI confirms before doing it.
 *
 * AI Logic is a paid resource that abusers target, so it should never sit
 * unprotected.
 */
const AUTO_ENFORCED_SERVICE_IDS: ReadonlySet<string> = new Set(["firebaseml.googleapis.com"]);

/**
 * The day App Check enforcement becomes mandatory for Firebase AI Logic.
 *
 * From this date Firebase automatically enforces App Check for all Gemini API
 * requests via AI Logic, and App Check cannot be un-enforced for AI Logic, so
 * any relaxed state a developer leaves behind stops working then. The wording
 * of the warnings follows the customer notice Firebase sent about this change.
 */
export const AI_LOGIC_ENFORCEMENT_DATE = "November 2, 2026";

/** Where the customer notice points people to implement App Check. */
export const AI_LOGIC_APP_CHECK_DOCS = "https://firebase.google.com/docs/ai-logic/app-check";

/** Whether this service will be enforced for everyone on the deadline above. */
export function isMandatoryFrom(serviceId: string): boolean {
  return serviceId === "firebaseml.googleapis.com";
}

const ENFORCEMENT_MODES: EnforcementMode[] = ["OFF", "UNENFORCED", "ENFORCED"];

/** How strict each mode is, used to compare baseline against replay protection. */
const MODE_RANK: Record<EnforcementMode, number> = { OFF: 0, UNENFORCED: 1, ENFORCED: 2 };

/** The alias list with product names, for help text and error messages. */
export function serviceAliasHelp(): string {
  return Object.entries(SERVICE_ALIAS_TO_ID)
    .map(([alias, id]) => `  ${alias.padEnd(13)} ${displayNameForServiceId(id)}`)
    .join("\n");
}

/**
 * Turns an alias or a full service id into the service id the API wants.
 * Throws a FirebaseError listing the aliases when the name is not one we know,
 * because the API answers an unknown id with a bare 400.
 */
export function resolveServiceId(service: string): string {
  const id = SERVICE_ALIAS_TO_ID[service];
  if (id) {
    return id;
  }
  if (SERVICE_ID_TO_ALIAS[service] || OTHER_SUPPORTED_SERVICE_IDS.has(service)) {
    return service;
  }
  throw new FirebaseError(
    `Unknown service: ${service}\n\nValid services:\n\n${serviceAliasHelp()}`,
  );
}

/** The short name for a service id, or the id itself when there is no alias. */
export function aliasForServiceId(serviceId: string): string {
  return SERVICE_ID_TO_ALIAS[serviceId] ?? serviceId;
}

/** Whether Firebase enforces App Check for this service on its own. */
export function isAutoEnforcedService(serviceId: string): boolean {
  return AUTO_ENFORCED_SERVICE_IDS.has(serviceId);
}

/** Turns `off`/`unenforced`/`enforced` (any case) into the API enum. */
export function parseEnforcementMode(mode: string): EnforcementMode {
  const upper = mode.toUpperCase();
  const found = ENFORCEMENT_MODES.find((m) => m === upper);
  if (!found) {
    throw new FirebaseError(
      `Unknown mode: ${mode}. Must be one of: ${ENFORCEMENT_MODES.map((m) => m.toLowerCase()).join(
        ", ",
      )}.`,
    );
  }
  return found;
}

/**
 * Rejects a replay protection level stronger than the baseline. The API returns
 * a 400 with no explanation in this case, so we say what is wrong instead.
 */
export function assertReplayProtectionAllowed(
  enforcement: EnforcementMode,
  replayProtection: EnforcementMode,
): void {
  if (MODE_RANK[replayProtection] > MODE_RANK[enforcement]) {
    throw new FirebaseError(
      `Replay protection cannot be stronger than enforcement. Set enforcement to ${replayProtection.toLowerCase()} first, or lower the replay protection level.`,
    );
  }
}

/**
 * Display text for a mode.
 *
 * A missing value means off. The API omits the field when the mode is `OFF`,
 * because that is the zero value of the enum, so an explicitly disabled service
 * and one nobody ever configured look identical in the response. The Updated
 * column is what tells the two apart.
 */
export function formatEnforcementMode(mode?: EnforcementMode): string {
  if (!mode) {
    return "Off";
  }
  return mode.charAt(0) + mode.slice(1).toLowerCase();
}

/** A never configured service reports this epoch timestamp. */
export function formatUpdateTime(updateTime?: string): string {
  if (!updateTime || updateTime.startsWith("1970-01-01")) {
    return "never";
  }
  return updateTime;
}

/** One line of the services table. */
export interface ServiceRow {
  alias: string;
  serviceId: string;
  enforcementMode: EnforcementMode | null;
  replayProtection: EnforcementMode | null;
  updateTime: string | null;
}

/**
 * One row per service the CLI knows about, plus any other service that already
 * has a configuration.
 *
 * The API only returns services that were configured at least once, so listing
 * just those would hide the ones a developer most likely wants to turn on.
 */
export function buildServiceRows(services: Service[]): ServiceRow[] {
  const configured = new Map(services.map((s) => [s.name.split("/").pop() ?? "", s]));
  const ids = new Set([...Object.values(SERVICE_ALIAS_TO_ID), ...configured.keys()]);

  return [...ids]
    .map((serviceId) => {
      const service = configured.get(serviceId);
      return {
        alias: aliasForServiceId(serviceId),
        serviceId,
        enforcementMode: service?.enforcementMode ?? null,
        replayProtection: service?.replayProtection ?? null,
        updateTime: service?.updateTime ?? null,
      };
    })
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

/**
 * The question to ask before writing, or null when the change cannot break a
 * running client.
 *
 * Turning enforcement on is what locks out old app versions, so that is the
 * usual case. Services Firebase enforces by default are the mirror image:
 * relaxing them is the dangerous move, so the question moves to that side.
 */
export function confirmationForModeChange(
  serviceId: string,
  alias: string,
  current: EnforcementMode | undefined,
  next: EnforcementMode,
): string | null {
  if (next === current) {
    return null;
  }
  if (isAutoEnforcedService(serviceId)) {
    if (next === "ENFORCED") {
      return null;
    }
    return (
      `${alias} is enforced by default to help protect your project resources and mitigate ` +
      `Gemini API abuse. Turning enforcement ${next.toLowerCase()} leaves it open to abuse.\n\n` +
      `Starting ${AI_LOGIC_ENFORCEMENT_DATE}, Firebase will automatically enforce App Check for ` +
      `all Gemini API requests via Firebase AI Logic, and App Check cannot be un-enforced for AI ` +
      `Logic. Requests to AI Logic without a valid App Check token will be rejected, and users ` +
      `running versions of your app that do not have App Check implemented will experience ` +
      `service disruption.\n\n` +
      `Continue?`
    );
  }
  return next === "ENFORCED"
    ? `Enforcing App Check for ${alias} will reject requests from clients that do not send a valid App Check token. Clients on old app versions may stop working. Continue?`
    : null;
}
