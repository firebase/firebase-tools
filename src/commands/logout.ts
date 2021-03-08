"use strict";

import { Command } from "../command";
import { configstore } from "../configstore";
import * as logger from "../logger";
import * as clc from "cli-color";

import * as utils from "../utils";
import * as api from "../api";
import * as auth from "../auth";
import * as _ from "lodash";
import { User, Tokens } from "../auth";

module.exports = new Command("logout [email]")
  .description("log the CLI out of Firebase")
  .action(async (email: string | undefined, options: any) => {
    // TODO: When no email, log out of all accounts
    // TODO: When email, log out of just one account

    const user = configstore.get("user") as User | undefined;
    const tokens = configstore.get("tokens") as Tokens | undefined;
    const currentToken = tokens?.refresh_token;

    const token = utils.getInheritedOption(options, "token") || currentToken;
    api.setRefreshToken(token);

    if (token) {
      try {
        await auth.logout(token);
      } catch (e) {
        utils.logWarning("Invalid refresh token, did not need to deauthorize");
      }
    }

    if (token || user || tokens) {
      let msg = "Logged out";
      if (token === currentToken) {
        if (user) {
          msg += " from " + clc.bold(user.email);
        }
      } else {
        msg += ' token "' + clc.bold(token) + '"';
      }
      utils.logSuccess(msg);
    } else {
      logger.info("No need to logout, not logged in");
    }
  });
