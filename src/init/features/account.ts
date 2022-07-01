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

import { logger } from "../../logger";
import * as utils from "../../utils";
import {
  getAllAccounts,
  loginAdditionalAccount,
  setActiveAccount,
  findAccountByEmail,
  Account,
  setProjectAccount,
} from "../../auth";
import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";

async function promptForAccount() {
  logger.info();
  logger.info(
    `Which account do you want to use for this project? Choose an account or add a new one now`
  );
  logger.info();

  const allAccounts = getAllAccounts();
  const choices = allAccounts.map((a) => {
    return {
      name: a.user.email,
      value: a.user.email,
    };
  });

  choices.push({
    name: "(add a new account)",
    value: "__add__",
  });

  const emailChoice: string = await promptOnce({
    type: "list",
    name: "email",
    message: "Please select an option:",
    choices,
  });

  if (emailChoice === "__add__") {
    const newAccount = await loginAdditionalAccount(/* useLocalhost= */ true);
    if (!newAccount) {
      throw new FirebaseError("Failed to add new account", { exit: 1 });
    }

    return newAccount;
  } else {
    return findAccountByEmail(emailChoice);
  }
}

/**
 * Sets up the project default account.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  let account: Account | undefined;

  if (options.account) {
    account = findAccountByEmail(options.account);
    if (!account) {
      throw new FirebaseError(`Invalid account ${options.account}`, { exit: 1 });
    }
  } else {
    account = await promptForAccount();
  }

  if (!account) {
    throw new FirebaseError(`No account selected, have you run "firebase login"?`, { exit: 1 });
  }

  // Set the global auth state
  setActiveAccount(options, account);

  // Set the project default user
  if (config.projectDir) {
    setProjectAccount(config.projectDir, account.user.email);
  }

  logger.info();
  utils.logSuccess(`Using account: ${account.user.email}`);
}
