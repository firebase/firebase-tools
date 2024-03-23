import * as clc from "colorette";

import { Command } from "../command";
import * as utils from "../utils";
import * as auth from "../auth";
import { FirebaseError } from "../error";

export const command = new Command("login:use <email>")
  .description(
    "set the default account to use for this project directory or the global default account if not in a Firebase project directory",
  )
  .action((email: string, options: any) => {
    const allAccounts = auth.getAllAccounts();
    const accountExists = allAccounts.some((a) => a.user.email === email);
    if (!accountExists) {
      throw new FirebaseError(
        `Account ${email} does not exist, run "${clc.bold(
          "firebase login:list",
        )}" to see valid accounts`,
      );
    }

    const projectDir = options.projectRoot as string | null;

    // if current directory is a Firebase project directory, set the default account for this project directory
    // otherwise, set the global default account
    if (projectDir) {
      if (options.user.email === email) {
        throw new FirebaseError(`Already using account ${email} for this project directory.`);
      }

      auth.setProjectAccount(projectDir, email);
      utils.logSuccess(`Set default account ${email} for current project directory.`);

      return email;
    } else {
      if (options.user.email === email) {
        throw new FirebaseError(`Already using account ${email} for the global default account.`);
      }
      const newDefaultAccount = allAccounts.find((a) => a.user.email === email);
      if (!newDefaultAccount) {
        // should never happen
        throw new FirebaseError(
          `Account ${email} does not exist, run "${clc.bold(
            "firebase login:list",
          )}" to see valid accounts`,
        );
      }
      const oldDefaultAccount = auth.getGlobalDefaultAccount();
      if (!oldDefaultAccount) {
        // should never happen
        throw new FirebaseError("Could not determine global default account");
      }
      // set new default account and removes it from additional accounts
      auth.setGlobalDefaultAccount(newDefaultAccount);
      // add old default account as additional account
      auth.addAdditionalAccount(oldDefaultAccount);

      utils.logSuccess(`Set global default account to ${email}.`);

      return email;
    }
  });
