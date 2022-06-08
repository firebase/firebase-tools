import * as clc from "cli-color";

import { User } from "../auth.js";
import { Command } from "../command.js";
import { logger } from "../logger.js";
import * as utils from "../utils.js";
import * as auth from "../auth.js";

export const command = new Command("login:list")
  .description("list authorized CLI accounts")
  .action((options: any) => {
    const user = options.user as User | undefined;
    const allAccounts = auth.getAllAccounts();

    if (!user) {
      utils.logWarning(`No authorized accounts, run "${clc.bold("firebase login")}"`);
      return;
    }

    logger.info(`Logged in as ${user.email}`);

    const otherAccounts = allAccounts.filter((a) => a.user.email !== user.email);
    if (otherAccounts.length > 0) {
      logger.info();
      logger.info(`Other available accounts (switch with "${clc.bold("firebase login:use")}")`);
      for (const a of otherAccounts) {
        logger.info(` - ${a.user.email}`);
      }
    }

    return allAccounts;
  });
