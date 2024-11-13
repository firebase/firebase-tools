// specific initialization steps for an emulator

import { promptOnce } from "../prompt";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators } from "./types";

export const AdditionalInitFns: {
  [e in Emulators]: () => Promise<Record<string, string> | null>;
} = {
  apphosting: async () => {
    // Auto-detect package manager and set startCommandOverride
    const logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);
    logger.log("BULLET", "Initializing App Hosting Emulator");

    const rootDirectory = await promptOnce({
      name: "rootDir",
      type: "input",
      default: "./",
      message: "Specify your app's root directory relative to your repository",
    });

    return {
      rootDirectory,
    };
    // prompt for apphosting yaml to export
  },
  auth: async () => {
    return null;
  },
  hub: async () => {
    return null;
  },
  functions: async () => {
    return null;
  },
  firestore: async () => {
    return null;
  },
  database: async () => {
    return null;
  },
  hosting: async () => {
    return null;
  },
  pubsub: async () => {
    return null;
  },
  ui: async () => {
    return null;
  },
  logging: async () => {
    return null;
  },
  storage: async () => {
    return null;
  },
  extensions: async () => {
    return null;
  },
  eventarc: async () => {
    return null;
  },
  dataconnect: async () => {
    return null;
  },
  tasks: async () => {
    return null;
  },
};
