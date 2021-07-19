import { Command } from "../command";
import * as utils from "../utils";

export default new Command("functions:purgeartifacts [filters...]")
  .description("")
  .option(
    "--region <region>",
    "Specify region of the function to be deleted. " +
      "If omitted, functions from all regions whose names match the filters will be deleted. "
  )
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  // .before(requirePermissions, ["cloudfunctions.functions.list", "cloudfunctions.functions.delete"])
  .action(async (filters: string[], options: { force: boolean; region?: string }) => {
    // TODO: fill out this command
    return utils.reject("You've enabled purgegcr!");
  });
