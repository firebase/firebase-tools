import { actionFunction } from "../functionsShellCommandAction.js";
import { Command } from "../command.js";
import { requireConfig } from "../requireConfig.js";
import { requirePermissions } from "../requirePermissions.js";

export const command = new Command("experimental:functions:shell")
  .description(
    "launch full Node shell with emulated functions. (Alias for `firebase functions:shell.)",
  )
  .option("-p, --port <port>", "the port on which to emulate functions (default: 5000)", 5000)
  .before(requireConfig)
  .before(requirePermissions)
  .action(actionFunction);
