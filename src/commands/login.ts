import * as clc from "colorette";

import { Command } from "../command";
import { logger } from "../logger";
import { configstore } from "../configstore";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import * as auth from "../auth";
import { isCloudEnvironment } from "../utils";
import { User, Tokens } from "../types/auth";

import { Options } from "../options";

export interface LoginOptions extends Options {
  prototyperLogin?: boolean;
  consent?: {
    metrics?: boolean;
    gemini?: boolean;
  };
}

export const command = new Command("login [auth_code]")
  .description("log the CLI into Firebase")
  .option("--no-localhost", "login from a device without an accessible localhost")
  .option("--reauth", "force reauthentication even if already logged in")
  .action(async (authCode: string | undefined, options: LoginOptions) => {
    if (authCode) {
      const state = configstore.get("tempLoginState") as
        | {
            sessionId: string;
            codeVerifier: string;
          }
        | undefined;

      if (!state || !state.codeVerifier) {
        throw new FirebaseError(
          "No pending login session found. Run " +
            clc.bold("firebase login") +
            " first to generate a login URL.",
          { exit: 1 },
        );
      }

      try {
        const result = await auth.loginRemotelyComplete(authCode, state.codeVerifier);
        auth.recordCredentials(result);
        configstore.delete("tempLoginState");

        logger.info();
        if (typeof result.user === "object" && result.user && result.user.email) {
          utils.logSuccess("Success! Logged in as " + clc.bold(result.user.email));
        } else {
          utils.logSuccess("Success! Logged in");
        }
        return auth;
      } catch (e: any) {
        configstore.delete("tempLoginState");
        throw new FirebaseError(`Login failed: ${e.message}`, { exit: 1 });
      }
    }

    if (options.nonInteractive && !options.prototyperLogin) {
      try {
        const { sessionId, sessionIdPrefix, loginUrl, codeVerifier } =
          await auth.loginRemotelyStart();

        configstore.set("tempLoginState", { sessionId, codeVerifier });

        logger.info();
        logger.info("To sign in to the Firebase CLI:");
        logger.info();
        logger.info("1. Take note of your session ID:");
        logger.info();
        logger.info(`   ${clc.bold(sessionIdPrefix)}`);
        logger.info();
        logger.info(
          "2. Visit the URL below on any device and follow the instructions to get your code:",
        );
        logger.info();
        logger.info(`   ${loginUrl}`);
        logger.info();
        logger.info("3. Complete the login by running:");
        logger.info();
        logger.info(`   ${clc.bold(`firebase login <authorizationCode>`)}`);
        logger.info();

        return;
      } catch (e: any) {
        throw new FirebaseError(`Failed to start login: ${e.message}`, { exit: 1 });
      }
    }

    const user = options.user as User | undefined;
    const tokens = options.tokens as Tokens | undefined;

    if (user && tokens?.refresh_token && !options.reauth) {
      logger.info("Already logged in as", clc.bold(user.email));
      return user;
    }

    if (options.consent) {
      options.consent?.metrics ?? configstore.set("usage", options.consent.metrics);
      options.consent?.gemini ?? configstore.set("gemini", options.consent.gemini);
    } else if (!options.reauth && !options.prototyperLogin) {
      utils.logBullet(
        "The Firebase CLI’s MCP server feature can optionally make use of Gemini in Firebase. " +
          "Learn more about Gemini in Firebase and how it uses your data: https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data",
      );
      const geminiUsage = await confirm("Enable Gemini in Firebase features?");
      configstore.set("gemini", geminiUsage);

      logger.info();
      utils.logBullet(
        "Firebase optionally collects CLI and Emulator Suite usage and error reporting information to help improve our products. Data is collected in accordance with Google's privacy policy (https://policies.google.com/privacy) and is not used to identify you.",
      );
      const collectUsage = await confirm(
        "Allow Firebase to collect CLI and Emulator Suite usage and error reporting information?",
      );
      configstore.set("usage", collectUsage);

      if (geminiUsage || collectUsage) {
        logger.info();
        utils.logBullet(
          "To change your preferences at any time, run `firebase logout` and `firebase login` again.",
        );
      }
    }

    // Special escape hatch for logging in when using firebase-tools as a module.
    if (options.prototyperLogin) {
      return auth.loginPrototyper();
    }

    // Default to using the authorization code flow when the end
    // user is within a cloud-based environment, and therefore,
    // the authorization callback couldn't redirect to localhost.
    const useLocalhost = !isCloudEnvironment() && !!options.localhost;
    const result = await auth.loginGoogle(useLocalhost, user?.email);
    auth.recordCredentials(result);

    logger.info();
    if (typeof result.user === "object" && result.user && result.user.email) {
      utils.logSuccess("Success! Logged in as " + clc.bold(result.user.email));
    } else {
      // Shouldn't really happen, but the JWT library that parses our results may
      // return a string
      logger.debug(
        "Unexpected string for UserCredentials.user. Maybe an auth response JWT didn't parse right?",
      );
      utils.logSuccess("Success! Logged in");
    }

    return auth;
  });
