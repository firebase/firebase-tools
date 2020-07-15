import { envOverride } from "../utils";
import { Constants } from "../emulator/constants";
import { previews } from "../previews";
import logger = require("../logger");

const DEFAULT_HOST = "https://firebaseio.com";

export function realtimeOriginOrEmulatorOrCustomUrl(options: any): string {
  // console.log("Options are: " + JSON.stringify(options));
  // logger.debug("Options are: ", options);
  const host = previews.rtdbmanagement
    ? options.instanceDetails.databaseUrl
    : DEFAULT_HOST;
  return envOverride(
    Constants.FIREBASE_DATABASE_EMULATOR_HOST,
    envOverride("FIREBASE_REALTIME_URL", host),
    addHttpIfRequired
  );
}

export function realtimeOriginOrCustomUrl(options: any): string {
  const host = previews.rtdbmanagement
    ? options.instanceDetails.databaseUrl
    : DEFAULT_HOST;
  return envOverride("FIREBASE_REALTIME_URL", host);
}

function addHttpIfRequired(val: string) {
  if (val.startsWith("http")) {
    return val;
  }
  return `http://${val}`;
}
