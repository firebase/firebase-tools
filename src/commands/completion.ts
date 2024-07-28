import fs = require("fs");

import { Command } from "../command";
import * as utils from "../utils";

export const command = new Command("completion <shell>")
  .description(
    'Generate tab-completion code for shell, currently "bash" and "fish" are supported values for shell.'
  )
  .option(
    "--shell <shell>",
    "Specify shell for which the completion code should be generated. " +
      'currently "bash" and "fish" are supported.'
  )
  .action(async (shell: "bash" | "fish") => {
    switch (shell) {
      case "bash":
        process.stdout.write(fs.readFileSync("completion.sh"));
        break;
      case "fish":
        process.stdout.write(fs.readFileSync("completion.fish"));
        break;
      default:
        return utils.reject('Shell must be either "bash" or "fish"', { exit: 1 });
    }
  });
