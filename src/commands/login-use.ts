import * as clc from "cli-color";

import { Command } from "../command";
import * as utils from "../utils";
import * as auth from "../auth";
import { FirebaseError } from "../error";

module.exports = new Command("login:use <email>")
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
