import { Command } from "../command";
import { logger } from "../logger";
import * as clc from "cli-color";

import * as utils from "../utils";
import * as auth from "../auth";
import { promptOnce } from "../prompt";

module.exports = new Command("logout [email]")
  .description("log the CLI out of Firebase")
  .action(async (email: string | undefined, options: any) => {
    const globalToken = utils.getInheritedOption(options, "token");
    utils.assertIsStringOrUndefined(globalToken);

    const allAccounts = auth.getAllAccounts();
    if (allAccounts.length === 0 && !globalToken) {
      logger.info("No need to logout, not logged in");
      return;
    }

    const defaultAccount = auth.getGlobalDefaultAccount();
    const additionalAccounts = auth.getAdditionalAccounts();

    const accountsToLogOut = email
      ? allAccounts.filter((a) => a.user.email === email)
      : allAccounts;

    if (email && accountsToLogOut.length === 0) {
      utils.logWarning(`No account matches ${email}, can't log out.`);
      return;
    }

    // If they are logging out of their primary account, choose one to
    // replace it.
    const logoutDefault = email === defaultAccount?.user.email;
    let newDefaultAccount: auth.Account | undefined = undefined;
    if (logoutDefault && additionalAccounts.length > 0) {
      if (additionalAccounts.length === 1) {
        newDefaultAccount = additionalAccounts[0];
      } else {
        const choices = additionalAccounts.map((a) => {
          return {
            name: a.user.email,
            value: a,
          };
        });

        newDefaultAccount = await promptOnce({
          type: "list",
          message:
            "You are logging out of your default account, which account should become the new default?",
          choices,
        });
      }
    }

    for (const account of accountsToLogOut) {
      const token = account.tokens.refresh_token;

      if (token) {
        auth.setRefreshToken(token);
        try {
          await auth.logout(token);
        } catch (e: any) {
          utils.logWarning(
            `Invalid refresh token for ${account.user.email}, did not need to deauthorize`
          );
        }

        utils.logSuccess(`Logged out from ${clc.bold(account.user.email)}`);
      }
    }

    if (globalToken) {
      auth.setRefreshToken(globalToken);
      try {
        await auth.logout(globalToken);
      } catch (e: any) {
        utils.logWarning("Invalid refresh token, did not need to deauthorize");
      }

      utils.logSuccess(`Logged out from token "${clc.bold(globalToken)}"`);
    }

    if (newDefaultAccount) {
      utils.logSuccess(`Setting default account to "${newDefaultAccount.user.email}"`);
      auth.setGlobalDefaultAccount(newDefaultAccount);
    }
  });
