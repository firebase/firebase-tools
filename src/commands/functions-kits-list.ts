import { Command } from "../command";
import { listKitConfigs } from "../functions/kits/config";
import { Options } from "../options";
import { logLabeledBullet } from "../utils";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import * as Table from "cli-table3";

export const command = new Command("functions:kits:list")
  .description("list all the kits that are installed in your firebase.json")
  .action((options: Options) => {
    const firebaseConfig = options.config;
    if (!firebaseConfig) {
      throw new FirebaseError(
        "No firebase.json found. Please run this command from within a Firebase project directory."
      );
    }
    const validatedConfig = firebaseConfig.src;
    const kitConfigs = listKitConfigs(validatedConfig);
    if (kitConfigs.length < 1) {
      logLabeledBullet("functions", `there are no kits in firebase.json`);
      return;
    }

    const table = new Table({ head: ["Kit", "Instances"], style: { head: ["yellow"] } });
    for (const kitConfig of kitConfigs) {
      const instanceIds = Object.keys(kitConfig.instances);
      table.push([kitConfig.kit, instanceIds.join(", ")]);
    }
    logger.info(table.toString());
  });
