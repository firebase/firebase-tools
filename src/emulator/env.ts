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
        env[Constants.FIREBASE_DATACONNECT_EMULATOR_HOST] = `http://${host}`;
        env[Constants.FIREBASE_DATACONNECT_ENV_ALT] = `http://${host}`;
        // Originally, there was a typo in this env var name. To avoid breaking folks unecessarily,
        // we'll keep setting this.
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
): Promise<Record<string, string>> {
  // Provide default application credentials when appropriate
  const credentialEnv: Record<string, string> = {};
  if (await hasDefaultCredentials()) {
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
