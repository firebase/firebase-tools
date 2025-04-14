import { envOverride } from "../utils";
import { Constants } from "../emulator/constants";

/**
 * Get base URL for RealtimeDatabase. Preference order: emulator host env override, realtime URL env override, and then specified host.
 * @param options command options.
 */
export function realtimeOriginOrEmulatorOrCustomUrl(host: string): string {
  return envOverride(
    Constants.FIREBASE_DATABASE_EMULATOR_HOST,
    envOverride("FIREBASE_REALTIME_URL", host),
    addHttpIfRequired,
  );
}

/**
 * Get base URL for RealtimeDatabase. Preference order: realtime URL env override, and then the specified host.
 * @param options command options.
 */
export function realtimeOriginOrCustomUrl(host: string): string {
  return envOverride("FIREBASE_REALTIME_URL", host);
}

function addHttpIfRequired(val: string) {
  if (val.startsWith("http")) {
    return val;
  }
  return `http://${val}`;
}
