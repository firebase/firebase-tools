/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Command } from "../command";
import { logger } from "../logger";
import * as clc from "cli-color";

import * as utils from "../utils";
import * as auth from "../auth";
import { promptOnce } from "../prompt";

export const command = new Command("logout [email]")
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
