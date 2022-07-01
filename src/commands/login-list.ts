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

import * as clc from "cli-color";

import { User } from "../auth";
import { Command } from "../command";
import { logger } from "../logger";
import * as utils from "../utils";
import * as auth from "../auth";

export const command = new Command("login:list")
  .description("list authorized CLI accounts")
  .action((options: any) => {
    const user = options.user as User | undefined;
    const allAccounts = auth.getAllAccounts();

    if (!user) {
      utils.logWarning(`No authorized accounts, run "${clc.bold("firebase login")}"`);
      return;
    }

    logger.info(`Logged in as ${user.email}`);

    const otherAccounts = allAccounts.filter((a) => a.user.email !== user.email);
    if (otherAccounts.length > 0) {
      logger.info();
      logger.info(`Other available accounts (switch with "${clc.bold("firebase login:use")}")`);
      for (const a of otherAccounts) {
        logger.info(` - ${a.user.email}`);
      }
    }

    return allAccounts;
  });
