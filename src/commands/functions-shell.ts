import { Command } from "../command.js";
import { requirePermissions } from "../requirePermissions.js";
import { actionFunction } from "../functionsShellCommandAction.js";
import { requireConfig } from "../requireConfig.js";
import { DESC_INSPECT_FUNCTIONS, FLAG_INSPECT_FUNCTIONS } from "../emulator/commandUtils.js";

export const command = new Command("functions:shell")
  .description("launch full Node shell with emulated functions")
  .option("-p, --port <port>", "the port on which to emulate functions")
  .option(FLAG_INSPECT_FUNCTIONS, DESC_INSPECT_FUNCTIONS)
  .before(requireConfig)
  .before(requirePermissions)
  .action(actionFunction);
