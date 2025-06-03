import { EmulatorHubClient } from "../../../emulator/hubClient.js";
import { Emulators } from "../../../emulator/types.js";

/**
 * Gets the Firestore emulator host and port from the Emulator Hub.
 * Throws an error if the Emulator Hub or Firestore emulator is not running.
 * @param hubClient The EmulatorHubClient instance.
 * @returns A string in the format "host:port".
 */
export async function getFirestoreEmulatorUrl(hubClient?: EmulatorHubClient): Promise<string> {
  if (!hubClient) {
    throw Error(
      "Emulator Hub not found or is not running. You can start the emulator by running `firebase emulators:start` in your firebase project directory.",
    );
  }

  const emulators = await hubClient.getEmulators();
  const firestoreEmulatorInfo = emulators[Emulators.FIRESTORE];
  if (!firestoreEmulatorInfo) {
    throw Error(
      "No Firestore Emulator found running. Make sure your project firebase.json file includes firestore and then rerun emulator using `firebase emulators:start` from your project directory.",
    );
  }

  return `http://${firestoreEmulatorInfo.host}:${firestoreEmulatorInfo.port}`;
}
