import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { actionFunction } from "../functionsShellCommandAction";
import { requireConfig } from "../requireConfig";
import { DESC_INSPECT_FUNCTIONS, FLAG_INSPECT_FUNCTIONS } from "../emulator/commandUtils";

export const command = new Command("functions:shell")
  .description("launch full Node shell with emulated functions")
  .option("-p, --port <port>", "the port on which to emulate functions")
  .option(FLAG_INSPECT_FUNCTIONS, DESC_INSPECT_FUNCTIONS)
  .before(requireConfig)
  .before(requirePermissions)
  .action(actionFunction);
