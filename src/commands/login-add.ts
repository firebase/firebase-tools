import * as _ from "lodash";
import * as clc from "cli-color";

import { User, Account } from "../auth";
import { Command } from "../command";
import * as logger from "../logger";
import { configstore } from "../configstore";
import * as utils from "../utils";
import { FirebaseError } from "../error";

import * as auth from "../auth";
import { isCloudEnvironment } from "../utils";

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
    const additionalAccounts = auth.getAdditionalAccounts();
    const allAccounts = auth.getAllAccounts();

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
    const useLocalhost = isCloudEnvironment() ? false : options.localhost;

    // Log the user in using the passed email as a hint
    const result = await auth.loginGoogle(useLocalhost, email);

    // The JWT library can technically return a string, even though it never should.
    if (typeof result.user === "string") {
      throw new FirebaseError("Failed to parse auth response, see debug log.", { exit: 1 });
    }

    if (email && result.user.email !== email) {
      utils.logWarning(`Chosen account ${result.user.email} does not match account hint ${email}`);
    }

    const resultMatch = allAccounts.find((a) => a.user.email === email);
    if (resultMatch) {
      utils.logWarning(`Already logged in as ${email}, nothing to do`);
      return auth;
    }

    additionalAccounts.push({
      user: result.user,
      tokens: result.tokens,
    });
    configstore.set("additionalAccounts", additionalAccounts);

    logger.info();
    utils.logSuccess("Success! Added account " + clc.bold(result.user.email));

    return auth;
  });
