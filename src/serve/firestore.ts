import { FirestoreEmulator } from "../emulator/firestoreEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";

module.exports = new EmulatorServer(new FirestoreEmulator({}));
