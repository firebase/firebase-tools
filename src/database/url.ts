import { envOverride } from "../utils";
import { Constants } from "../emulator/constants";

export function realtimeOriginOrEmulatorOrCustomUrl(customUrl: string): string {
  return envOverride(
    Constants.FIREBASE_DATABASE_EMULATOR_HOST,
    envOverride("FIREBASE_REALTIME_URL", customUrl),
    (val: string) => {
      if (val.startsWith("http")) {
        return val;
      }
      return `http://${val}`;
    }
  );
}
