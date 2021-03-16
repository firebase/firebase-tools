import { User } from "../auth";
import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";
import * as auth from "../auth";

module.exports = new Command("login:list")
  .description("List authorized CLI accounts")
  .action((options: any) => {
    const user = options.user as User | undefined;
    const allAccounts = auth.getAllAccounts();

    if (!user) {
      utils.logWarning(`No authorized accounts, run "firebase login"`);
      return;
    }

    logger.info(`Logged in as ${user.email}`);

    const otherAccounts = allAccounts.filter((a) => a.user.email !== user.email);
    if (otherAccounts.length > 0) {
      logger.info();
      logger.info("Other available accounts (switch with login:use)");
      for (const a of otherAccounts) {
        logger.info(` - ${a.user.email}`);
      }
    }

    return allAccounts;
  });
