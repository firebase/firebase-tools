import * as _ from "lodash";
import * as clc from "cli-color";

import { Command } from "../command";
import * as logger from "../logger";
import { configstore } from "../configstore";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { prompt } from "../prompt";

import * as auth from "../auth";
import { isCloudEnvironment } from "../utils";

module.exports = new Command("login")
  .description("log the CLI into Firebase")
  .option(
    "--no-localhost",
    "copy and paste a code instead of starting a local server for authentication"
  )
  .option("--reauth", "force reauthentication even if already logged in")
  .action(async (options: any) => {
    if (options.nonInteractive) {
      throw new FirebaseError(
        "Cannot run login in non-interactive mode. See " +
          clc.bold("login:ci") +
          " to generate a token for use in non-interactive environments.",
        { exit: 1 }
      );
    }

    const user = configstore.get("user");
    const tokens = configstore.get("tokens");

    if (user && tokens && !options.reauth) {
      logger.info("Already logged in as", clc.bold(user.email));
      return user;
    }

    if (!options.reauth) {
      utils.logBullet(
        "Firebase optionally collects CLI usage and error reporting information to help improve our products. Data is collected in accordance with Google's privacy policy (https://policies.google.com/privacy) and is not used to identify you.\n"
      );
      await prompt(options, [
        {
          type: "confirm",
          name: "collectUsage",
          message: "Allow Firebase to collect CLI usage and error reporting information?",
        },
      ]);
      configstore.set("usage", options.collectUsage);
      if (options.collectUsage) {
        utils.logBullet(
          "To change your data collection preference at any time, run `firebase logout` and log in again."
        );
      }
    }

    // Default to using the authorization code flow when the end
    // user is within a cloud-based environment, and therefore,
    // the authorization callback couldn't redirect to localhost.
    const useLocalhost = isCloudEnvironment() ? false : options.localhost;

    const result = await auth.login(useLocalhost, _.get(user, "email"));
    configstore.set("user", result.user);
    configstore.set("tokens", result.tokens);
    // store login scopes in case mandatory scopes grow over time
    configstore.set("loginScopes", result.scopes);
    // remove old session token, if it exists
    configstore.delete("session");

    logger.info();
    utils.logSuccess("Success! Logged in as " + clc.bold(result.user.email));

    return auth;
  });
