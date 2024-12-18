import * as clc from "colorette";
import * as fs from "fs";
import * as os from "os";

import { Command } from "../command.js";
import { logger } from "../logger.js";
import { needProjectId } from "../projectUtils.js";
import { requirePermissions } from "../requirePermissions.js";
import { validateOptions, serialExportUsers } from "../accountExporter.js";

const MAX_BATCH_SIZE = 1000;

interface exportOptions {
  format: string;
  writeStream: fs.WriteStream;
  batchSize: number;
}

export const command = new Command("auth:export [dataFile]")
  .description("Export accounts from your Firebase project into a data file")
  .option(
    "--format <format>",
    "Format of exported data (csv, json). Ignored if <dataFile> has format extension.",
  )
  .before(requirePermissions, ["firebaseauth.users.get"])
  .action((dataFile, options) => {
    const projectId = needProjectId(options);
    const checkRes = validateOptions(options, dataFile);
    if (!checkRes.format) {
      return checkRes;
    }
    const writeStream = fs.createWriteStream(dataFile);
    if (checkRes.format === "json") {
      writeStream.write('{"users": [' + os.EOL);
    }
    const exportOptions: exportOptions = {
      format: checkRes.format,
      writeStream,
      batchSize: MAX_BATCH_SIZE,
    };
    logger.info("Exporting accounts to " + clc.bold(dataFile));
    return serialExportUsers(projectId, exportOptions).then(() => {
      if (exportOptions.format === "json") {
        writeStream.write("]}");
      }
      writeStream.end();
      // Ensure process ends only when all data have been flushed
      // to the output file
      return new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("close", resolve);
        writeStream.on("error", reject);
      });
    });
  });
