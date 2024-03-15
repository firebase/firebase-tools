import { actionFunction } from "../functionsShellCommandAction";
import { Command } from "../command";
import { requireConfig } from "../requireConfig";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("experimental:functions:shell")
  .description(
    "launch full Node shell with emulated functions. (Alias for `firebase functions:shell.)",
  )
  .option("-p, --port <port>", "the port on which to emulate functions (default: 5000)", 5000)
  .before(requireConfig)
  .before(requirePermissions)
  .action(actionFunction);
