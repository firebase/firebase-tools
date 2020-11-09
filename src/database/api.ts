import { envOverride } from "../utils";
import { Constants } from "../emulator/constants";

/**
 * Get base URL for RealtimeDatabase. Preference order: emulator host env override, realtime URL env override, options.instanceDetails.databaseUrl, and then default host.
 * @param options command options.
 */
export function realtimeOriginOrEmulatorOrCustomUrl(options: any): string {
  const host = options.instanceDetails.databaseUrl;
  return envOverride(
    Constants.FIREBASE_DATABASE_EMULATOR_HOST,
    envOverride("FIREBASE_REALTIME_URL", host),
    addHttpIfRequired
  );
}

/**
 * Get base URL for RealtimeDatabase. Preference order: realtime URL env override, options.instanceDetails.databaseUrl, and then default host.
 * @param options command options.
 */
export function realtimeOriginOrCustomUrl(options: any): string {
  const host = options.instanceDetails.databaseUrl;
  return envOverride("FIREBASE_REALTIME_URL", host);
}

function addHttpIfRequired(val: string) {
  if (val.startsWith("http")) {
    return val;
  }
  return `http://${val}`;
}
