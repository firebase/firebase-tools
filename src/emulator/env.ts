import { Constants } from "./constants";
import { Emulators } from "./types";
import { EmulatorRegistry } from "./registry";

/**
 * Adds or replaces emulator-related env vars (for Admin SDKs, etc.).
 * @param env a `process.env`-like object or Record to be modified
 */
export function setEnvVarsForEmulators(env: Record<string, string | undefined>): void {
  if (EmulatorRegistry.isRunning(Emulators.DATABASE)) {
    env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = EmulatorRegistry.url(Emulators.DATABASE).host;
  }

  if (EmulatorRegistry.isRunning(Emulators.FIRESTORE)) {
    const { host } = EmulatorRegistry.url(Emulators.FIRESTORE);
    env[Constants.FIRESTORE_EMULATOR_HOST] = host;
    env[Constants.FIRESTORE_EMULATOR_ENV_ALT] = host;
  }

  if (EmulatorRegistry.isRunning(Emulators.STORAGE)) {
    const { host } = EmulatorRegistry.url(Emulators.STORAGE);
    env[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = host;
    // The protocol is required for the Google Cloud Storage Node.js Client SDK.
    env[Constants.CLOUD_STORAGE_EMULATOR_HOST] = `http://${host}`;
  }

  if (EmulatorRegistry.isRunning(Emulators.AUTH)) {
    env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = EmulatorRegistry.url(Emulators.AUTH).host;
  }

  if (EmulatorRegistry.isRunning(Emulators.HUB)) {
    env[Constants.FIREBASE_EMULATOR_HUB] = EmulatorRegistry.url(Emulators.HUB).host;
  }

  const pubsubEmulator = EmulatorRegistry.isRunning(Emulators.PUBSUB);
  if (pubsubEmulator) {
    env[Constants.PUBSUB_EMULATOR_HOST] = EmulatorRegistry.url(Emulators.PUBSUB).host;
  }

  if (EmulatorRegistry.isRunning(Emulators.EVENTARC)) {
    // The protocol is required for the Firebase Admin Node.js SDK for Eventarc.
    // https://github.com/firebase/firebase-admin-node/blob/ee60cd1acb8722ba4081b9837d2f90101e2b3227/src/eventarc/eventarc-client-internal.ts#L105
    env[Constants.CLOUD_EVENTARC_EMULATOR_HOST] = `http://${
      EmulatorRegistry.url(Emulators.EVENTARC).host
    }`;
  }
}
