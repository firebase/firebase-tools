import { Command } from "../command";
import * as utils from "../utils";
import * as auth from "../auth";
import { FirebaseError } from "../error";

export const command = new Command("login:use <email>")
  .description(
    "set the default account to use for this project directory or the global default account if not in a Firebase project directory",
  )
  .action((email: string, options: any) => {
    auth.assertAccount(email);
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
      const oldDefaultAccount = auth.getGlobalDefaultAccount();
      if (!oldDefaultAccount) {
        // should never happen
        throw new FirebaseError("Could not determine global default account");
      }
      // set new default account and removes it from additional accounts
      auth.setGlobalDefaultAccount(email);
      // add old default account as additional account
      auth.addAdditionalAccount(oldDefaultAccount);

      utils.logSuccess(`Set global default account to ${email}.`);

      return email;
    }
  });
