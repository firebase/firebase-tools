/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
    "collect database usage information for the specified number of seconds"
  )
  .option("--raw", "output the raw stats collected as newline delimited json")
  .option("--no-collapse", "prevent collapsing similar paths into $wildcard locations")
  .option(
    "-i, --input <filename>",
    "generate the report based on the specified file instead " +
      "of streaming logs from the database"
  )
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
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
