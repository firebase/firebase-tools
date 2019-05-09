import { DatabaseEmulator } from "../emulator/databaseEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";

module.exports = new EmulatorServer(new DatabaseEmulator({}));
