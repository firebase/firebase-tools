import { Constants } from "./constants";
import { EmulatorInfo, Emulators } from "./types";
import { formatHost } from "./functionsEmulatorShared";

/**
 * Adds or replaces emulator-related env vars (for Admin SDKs, etc.).
 * @param env a `process.env`-like object or Record to be modified
 * @param emulators the emulator info to use
 */
export function setEnvVarsForEmulators(
  env: Record<string, string | undefined>,
  emulators: EmulatorInfo[],
): void {
  for (const emu of emulators) {
    const host = formatHost(emu);
    switch (emu.name) {
      case Emulators.FIRESTORE:
        env[Constants.FIRESTORE_EMULATOR_HOST] = host;
        env[Constants.FIRESTORE_EMULATOR_ENV_ALT] = host;
        break;
      case Emulators.DATABASE:
        env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = host;
        break;
      case Emulators.STORAGE:
        env[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = host;
        // The protocol is required for the Google Cloud Storage Node.js Client SDK.
        env[Constants.CLOUD_STORAGE_EMULATOR_HOST] = `http://${host}`;
        break;
      case Emulators.AUTH:
        env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = host;
        break;
      case Emulators.HUB:
        env[Constants.FIREBASE_EMULATOR_HUB] = host;
        break;
      case Emulators.PUBSUB:
        env[Constants.PUBSUB_EMULATOR_HOST] = host;
        break;
      case Emulators.EVENTARC:
        env[Constants.CLOUD_EVENTARC_EMULATOR_HOST] = `http://${host}`;
        break;
    }
  }
}
