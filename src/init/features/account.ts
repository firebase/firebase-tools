import { logger } from "../../logger";
import * as utils from "../../utils";
import {
  getAllAccounts,
  loginAdditionalAccount,
  setActiveAccount,
  findAccountByEmail,
  setProjectAccount,
} from "../../auth";
import { Account } from "../../types/auth";
import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";

async function promptForAccount() {
  logger.info();
  logger.info(
    `Which account do you want to use for this project? Choose an account or add a new one now`,
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
