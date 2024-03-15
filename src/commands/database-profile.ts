import { Command } from "../command";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { populateInstanceDetails } from "../management/database";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { profiler } from "../profiler";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";

const description = "profile the Realtime Database and generate a usage report";

export const command = new Command("database:profile")
  .description(description)
  .option("-o, --output <filename>", "save the output to the specified file")
  .option(
    "-d, --duration <seconds>",
    "collect database usage information for the specified number of seconds",
  )
  .option("--raw", "output the raw stats collected as newline delimited json")
  .option("--no-collapse", "prevent collapsing similar paths into $wildcard locations")
  .option(
    "-i, --input <filename>",
    "generate the report based on the specified file instead " +
      "of streaming logs from the database",
  )
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)",
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action((options) => {
    // Validate options
    if (options.raw && options.input) {
      return utils.reject("Cannot specify both an input file and raw format", {
        exit: 1,
      });
    } else if (options.parent.json && options.raw) {
      return utils.reject("Cannot output raw data in json format", { exit: 1 });
    } else if (options.input && options.duration !== undefined) {
      return utils.reject("Cannot specify a duration for input files", {
        exit: 1,
      });
    } else if (options.duration !== undefined && options.duration <= 0) {
      return utils.reject("Must specify a positive number of seconds", {
        exit: 1,
      });
    }

    return profiler(options);
  });
