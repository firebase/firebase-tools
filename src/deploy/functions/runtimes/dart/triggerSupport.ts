/**
 * Dart trigger support classification.
 *
 * Firebase Functions for Dart is in alpha. Only HTTPS triggers are
 * production-ready today. Other trigger types have varying levels of
 * support as documented in the firebase-functions-dart README.
 *
 * This module is the single source of truth for that classification and
 * is consumed by both the emulator and the deploy pipeline so warnings
 * stay consistent.
 */

import * as backend from "../../backend";
import * as supported from "../supported";
import { Constants } from "../../../../emulator/constants";

// ---------------------------------------------------------------------------
// Support levels
// ---------------------------------------------------------------------------

/**
 * How well a Dart trigger type is supported today.
 *
 * - `production`    – works in both the emulator and production deployments.
 * - `emulatorOnly`  – works in the Firebase emulator but cannot be deployed
 *                     to production yet.
 * - `experimental`  – implemented in the Dart SDK but not yet supported by
 *                     the emulator or production. APIs may change.
 */
export type DartTriggerSupportLevel = "production" | "emulatorOnly" | "experimental";

// ---------------------------------------------------------------------------
// Service → support-level maps
// ---------------------------------------------------------------------------

/** Event-trigger services that work in the emulator only. */
const EMULATOR_ONLY_SERVICES: ReadonlySet<string> = new Set([
  Constants.SERVICE_FIRESTORE,
  Constants.SERVICE_REALTIME_DATABASE,
  Constants.SERVICE_STORAGE,
]);

/** Event-trigger services that are experimental. */
const EXPERIMENTAL_SERVICES: ReadonlySet<string> = new Set([
  Constants.SERVICE_PUBSUB,
  Constants.SERVICE_EVENTARC,
  Constants.SERVICE_AUTH,
  Constants.SERVICE_FIREALERTS,
  Constants.SERVICE_REMOTE_CONFIG,
  Constants.SERVICE_TEST_LAB,
  Constants.SERVICE_CLOUD_TASKS,
]);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns the support level for a Dart endpoint's trigger type.
 *
 * The classification intentionally matches the status table in the
 * firebase-functions-dart README:
 * | Status            | Triggers                                           |
 * |-------------------|----------------------------------------------------|
 * | ✅ Production     | HTTPS (`onRequest`, `onCall`, `onCallWithData`)    |
 * | ⚠️ Emulator only  | Firestore, Realtime Database, Storage              |
 * | 🚧 Experimental   | Pub/Sub, Scheduler, Alerts, Eventarc, Identity,    |
 * |                   | Remote Config, Test Lab, Tasks                     |
 */
export function endpointSupportLevel(ep: backend.Endpoint): DartTriggerSupportLevel {
  // HTTPS and callable triggers are production-ready.
  if (backend.isHttpsTriggered(ep) || backend.isCallableTriggered(ep)) {
    // Task-queue functions look like HTTPS but are experimental.
    if (backend.isTaskQueueTriggered(ep)) {
      return "experimental";
    }
    return "production";
  }

  // Scheduled triggers are experimental (emulator converts them to pubsub).
  if (backend.isScheduleTriggered(ep)) {
    return "experimental";
  }

  // Blocking triggers (Identity Platform) are experimental.
  if (backend.isBlockingTriggered(ep)) {
    return "experimental";
  }

  // Remaining event triggers — classify by service.
  if (backend.isEventTriggered(ep)) {
    // Eventarc custom events are identified by the presence of a channel.
    if (ep.eventTrigger.channel) {
      return "experimental";
    }
    const service = ep.eventTrigger.eventType
      ? serviceFromEventType(ep.eventTrigger.eventType)
      : undefined;
    if (service && EMULATOR_ONLY_SERVICES.has(service)) {
      return "emulatorOnly";
    }
    if (service && EXPERIMENTAL_SERVICES.has(service)) {
      return "experimental";
    }
  }

  // Unknown trigger.
  return "experimental";
}

/**
 * Returns `true` when the given endpoint belongs to a Dart runtime.
 */
export function isDartEndpoint(ep: backend.Endpoint): boolean {
  return supported.runtimeIsLanguage(ep.runtime, "dart");
}

/**
 * Partitions a list of Dart endpoints by their support level.
 *
 * Only non-production endpoints are returned — callers never need to
 * enumerate production-ready functions.
 */
export function classifyNonProductionEndpoints(endpoints: backend.Endpoint[]): {
  emulatorOnly: backend.Endpoint[];
  experimental: backend.Endpoint[];
} {
  const emulatorOnly: backend.Endpoint[] = [];
  const experimental: backend.Endpoint[] = [];

  for (const ep of endpoints) {
    switch (endpointSupportLevel(ep)) {
      case "production":
        break;
      case "emulatorOnly":
        emulatorOnly.push(ep);
        break;
      case "experimental":
        experimental.push(ep);
        break;
    }
  }

  return { emulatorOnly, experimental };
}

/**
 * Returns a human-readable trigger-type label for a Dart endpoint.
 *
 * Used to produce grouped warning messages like
 * `Dart **firestore** triggers work in the emulator but …`
 */
export function triggerTypeLabel(ep: backend.Endpoint): string {
  if (backend.isScheduleTriggered(ep)) return "scheduler";
  if (backend.isTaskQueueTriggered(ep)) return "tasks";
  if (backend.isBlockingTriggered(ep)) return "identity";
  if (backend.isCallableTriggered(ep)) return "callable";
  if (backend.isHttpsTriggered(ep)) return "https";
  if (backend.isEventTriggered(ep)) {
    if (ep.eventTrigger.channel) return "eventarc";
    const svc = serviceFromEventType(ep.eventTrigger.eventType);
    return svc ? Constants.getServiceName(svc) : ep.eventTrigger.eventType;
  }
  return "unknown";
}

/**
 * Groups endpoints by their {@link triggerTypeLabel} and returns a
 * `Map<label, endpointIds[]>` suitable for building warning messages.
 */
export function groupByTriggerLabel(endpoints: backend.Endpoint[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const ep of endpoints) {
    const label = triggerTypeLabel(ep);
    const ids = groups.get(label) ?? [];
    ids.push(ep.id);
    groups.set(label, ids);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Rough mapping from a CloudEvent `eventType` string to a service constant.
 *
 * This mirrors the logic in `functionsEmulatorShared.getServiceFromEventType`
 * but is kept local so the module stays self-contained.
 */
function serviceFromEventType(eventType: string): string | undefined {
  if (eventType.includes("firestore")) return Constants.SERVICE_FIRESTORE;
  if (eventType.includes("database")) return Constants.SERVICE_REALTIME_DATABASE;
  if (eventType.includes("pubsub")) return Constants.SERVICE_PUBSUB;
  if (eventType.includes("storage")) return Constants.SERVICE_STORAGE;
  if (eventType.includes("eventarc")) return Constants.SERVICE_EVENTARC;
  if (eventType.includes("firebasealerts")) return Constants.SERVICE_FIREALERTS;
  if (eventType.includes("auth")) return Constants.SERVICE_AUTH;
  if (eventType.includes("remoteconfig")) return Constants.SERVICE_REMOTE_CONFIG;
  if (eventType.includes("testlab") || eventType.includes("testing"))
    return Constants.SERVICE_TEST_LAB;
  return undefined;
}
