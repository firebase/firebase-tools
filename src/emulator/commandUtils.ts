import * as controller from "../emulator/controller";
import * as Config from "../config";
import * as utils from "../utils";
import requireAuth = require("../requireAuth");
import requireConfig = require("../requireConfig");
import { Emulators } from "../emulator/types";

/**
 * We want to be able to run the Firestore and Database emulators even in the absence
 * of firebase.json. For Functions and Hosting we require the JSON file since the
 * config interactions can become fairly complex.
 */
const DEFAULT_CONFIG = new Config({ database: {}, firestore: {}, functions: {}, hosting: {} }, {});

export async function beforeEmulatorCommand(options: any): Promise<any> {
  const optionsWithDefaultConfig = {
    ...options,
    config: DEFAULT_CONFIG,
  };
  const optionsWithConfig = options.config ? options : optionsWithDefaultConfig;

  const requiresAuth = controller.shouldStart(optionsWithConfig, Emulators.HOSTING);

  const canStartWithoutConfig =
    options.only &&
    !controller.shouldStart(optionsWithConfig, Emulators.FUNCTIONS) &&
    !controller.shouldStart(optionsWithConfig, Emulators.HOSTING);

  if (canStartWithoutConfig && !options.config) {
    utils.logWarning("Could not find config (firebase.json) so using defaults.");
    options.config = DEFAULT_CONFIG;
  } else {
    await requireConfig(options);
    if (requiresAuth) {
      await requireAuth(options);
    }
  }
}
