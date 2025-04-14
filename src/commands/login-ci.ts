import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as auth from "../auth";
import * as utils from "../utils";

export const command = new Command("login:ci")
  .description("generate an access token for use in non-interactive environments")
  .option(
    "--no-localhost",
    "copy and paste a code instead of starting a local server for authentication",
  )
  .action(async (options) => {
    if (options.nonInteractive) {
      throw new FirebaseError("Cannot run login:ci in non-interactive mode.");
    }

    utils.logWarning(
      "Authenticating with a `login:ci` token is deprecated and will be removed in a future major version of `firebase-tools`. " +
        "Instead, use a service account key with `GOOGLE_APPLICATION_CREDENTIALS`: https://cloud.google.com/docs/authentication/getting-started",
    );

    const userCredentials = await auth.loginGoogle(options.localhost);
    logger.info();
    utils.logSuccess(
      "Success! Use this token to login on a CI server:\n\n" +
        clc.bold(userCredentials.tokens.refresh_token || "") +
        '\n\nExample: firebase deploy --token "$FIREBASE_TOKEN"\n',
    );
    return userCredentials;
  });
