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

import { Command } from "../command";
import * as utils from "../utils";
import * as auth from "../auth";
import { FirebaseError } from "../error";

export const command = new Command("login:use <email>")
  .description("set the default account to use for this project directory")
  .action((email: string, options: any) => {
    const allAccounts = auth.getAllAccounts();
    const accountExists = allAccounts.some((a) => a.user.email === email);
    if (!accountExists) {
      throw new FirebaseError(
        `Account ${email} does not exist, run "${clc.bold(
          "firebase login:list"
        )}" to see valid accounts`
      );
    }

    const projectDir = options.projectRoot as string | null;
    if (!projectDir) {
      throw new FirebaseError("Could not determine active Firebase project directory");
    }

    auth.setProjectAccount(projectDir, email);
    utils.logSuccess(`Set default account ${email} for current project directory.`);

    return email;
  });
