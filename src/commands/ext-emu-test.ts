import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import * as parseExtensions from "../extensions/declarative-extensions/parseExtensions";
import { buildOptions } from "../extensions/emulator/optionsHelper";
import { FirebaseError } from "../error";

import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";

module.exports = new Command("ext:emu:test")
  .before(requirePermissions, [])
  .action(async (options: any) => {
    const killSignalPromise = commandUtils.shutdownWhenKilled(options);
    const emulatableExtensions = await parseExtensions.readExtensionsConfig(options.config);
    const emulatorOptions = await buildOptions(options, emulatableExtensions[0]);
    try {
      await commandUtils.beforeEmulatorCommand(emulatorOptions);
      await controller.startAll(emulatorOptions);
    } catch (e) {
      await controller.cleanShutdown();
      if (!(e instanceof FirebaseError)) {
        console.log(e);
        throw new FirebaseError("Error in ext:dev:emulator:start", e);
      }
      throw e;
    }

    console.log("All emulators ready, it is now safe to connect.");

    // Hang until explicitly killed
    await killSignalPromise;
  });
