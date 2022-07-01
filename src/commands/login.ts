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

import * as _ from "lodash";
import * as clc from "cli-color";

import { Command } from "../command";
import { logger } from "../logger";
import { configstore } from "../configstore";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";

import * as auth from "../auth";
import { isCloudEnvironment } from "../utils";

export const command = new Command("login")
  .description("log the CLI into Firebase")
  .option("--no-localhost", "login from a device without an accessible localhost")
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

    const user = options.user as auth.User | undefined;
    const tokens = options.tokens as auth.Tokens | undefined;

    if (user && tokens && !options.reauth) {
      logger.info("Already logged in as", clc.bold(user.email));
      return user;
    }

    if (!options.reauth) {
      utils.logBullet(
        "Firebase optionally collects CLI usage and error reporting information to help improve our products. Data is collected in accordance with Google's privacy policy (https://policies.google.com/privacy) and is not used to identify you.\n"
      );
      const collectUsage = await promptOnce({
        type: "confirm",
        name: "collectUsage",
        message: "Allow Firebase to collect CLI usage and error reporting information?",
      });
      configstore.set("usage", collectUsage);
      if (collectUsage) {
        utils.logBullet(
          "To change your data collection preference at any time, run `firebase logout` and log in again."
        );
      }
    }

    // Default to using the authorization code flow when the end
    // user is within a cloud-based environment, and therefore,
    // the authorization callback couldn't redirect to localhost.
    const useLocalhost = isCloudEnvironment() ? false : options.localhost;

    const result = await auth.loginGoogle(useLocalhost, _.get(user, "email"));
    configstore.set("user", result.user);
    configstore.set("tokens", result.tokens);
    // store login scopes in case mandatory scopes grow over time
    configstore.set("loginScopes", result.scopes);
    // remove old session token, if it exists
    configstore.delete("session");

    logger.info();
    if (typeof result.user !== "string") {
      utils.logSuccess("Success! Logged in as " + clc.bold(result.user.email));
    } else {
      // Shouldn't really happen, but the JWT library that parses our results may
      // return a string
      logger.debug(
        "Unexpected string for UserCredentials.user. Maybe an auth response JWT didn't parse right?"
      );
      utils.logSuccess("Success! Logged in");
    }

    return auth;
  });
