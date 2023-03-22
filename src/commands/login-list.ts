import * as clc from "colorette";

import { User } from "../types/auth";
import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";
import * as auth from "../auth";

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
