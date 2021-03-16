import * as clc from "cli-color";

import { Command } from "../command";
import * as logger from "../logger";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import * as auth from "../auth";

module.exports = new Command("login:add [email]")
  .description("authorize the CLI for an additional account")
  .option(
    "--no-localhost",
    "copy and paste a code instead of starting a local server for authentication"
  )
  .action(async (email: string | undefined, options: any) => {
    if (options.nonInteractive) {
      throw new FirebaseError("Cannot run login:add in non-interactive mode.", { exit: 1 });
    }

    const account = auth.getGlobalDefaultAccount();

    // "login" asks for the data collection preference, we only want to do that in one place
    if (!account) {
      throw new FirebaseError(
        "No existing accounts found, please run login to add your first account",
        { exit: 1 }
      );
    }

    // Don't do anything if the email they provided matches the primary email
    const hintUser = auth.getAllAccounts().find((a) => a.user.email === email);
    if (email && hintUser) {
      throw new FirebaseError(
        `Already signed in as ${email}, use login --reauth to reauthenticate.`,
        { exit: 1 }
      );
    }

    // Default to using the authorization code flow when the end
    // user is within a cloud-based environment, and therefore,
    // the authorization callback couldn't redirect to localhost.
    const useLocalhost = utils.isCloudEnvironment() ? false : options.localhost;

    const newAccount = await auth.loginAdditionalAccount(useLocalhost, email);
    if (newAccount) {
      logger.info();
      utils.logSuccess("Success! Added account " + clc.bold(newAccount.user.email));
    }

    return newAccount;
  });
