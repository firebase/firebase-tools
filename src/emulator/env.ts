import { Constants } from "./constants";
import { EmulatorInfo, Emulators } from "./types";
import { formatHost } from "./functionsEmulatorShared";
import { Account } from "../types/auth/index";
import { EmulatorLogger } from "./emulatorLogger";
import { getCredentialPathAsync, hasDefaultCredentials } from "../defaultCredentials";

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
      case Emulators.TASKS:
        env[Constants.CLOUD_TASKS_EMULATOR_HOST] = host;
        break;
      case Emulators.DATACONNECT:
        // Right now, the JS SDK requires a protocol within the env var.
        // https://github.com/firebase/firebase-js-sdk/blob/88a8055808bdbd1c75011a94d11062460027d931/packages/data-connect/src/api/DataConnect.ts#L74
        env[Constants.FIREBASE_DATACONNECT_EMULATOR_HOST] = `http://${host}`;
        // The alternative env var, right now only read by the Node.js Admin SDK, does not work if a protocol is appended.
        // https://github.com/firebase/firebase-admin-node/blob/a46086b61f58f07426a6ca103e00385ae216691d/src/data-connect/data-connect-api-client-internal.ts#L220
        env[Constants.FIREBASE_DATACONNECT_ENV_ALT] = host;
        // A previous CLI release set the following env var as well but it is missing an underscore between `DATA` and `CONNECT`.
        // We'll keep setting this for customers who depends on this misspelled name. Its value is also kept protocol-less.
        env["FIREBASE_DATACONNECT_EMULATOR_HOST"] = host;
    }
  }
}

/**
 * getCredentialsEnvironment returns any extra env vars beyond process.env that should be provided to emulators to ensure they have credentials.
 */
export async function getCredentialsEnvironment(
  account: Account | undefined,
  logger: EmulatorLogger,
  logLabel: string,
  silent: boolean = false,
): Promise<Record<string, string>> {
  // Provide default application credentials when appropriate
  const credentialEnv: Record<string, string> = {};
  if (await hasDefaultCredentials()) {
    !silent &&
      logger.logLabeled(
        "WARN",
        logLabel,
        `Application Default Credentials detected. Non-emulated services will access production using these credentials. Be careful!`,
      );
  } else if (account) {
    const defaultCredPath = await getCredentialPathAsync(account);
    if (defaultCredPath) {
      logger.log("DEBUG", `Setting GAC to ${defaultCredPath}`);
      credentialEnv.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
    }
  }
  return credentialEnv;
}
