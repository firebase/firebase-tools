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

import * as clc from "cli-color";
import * as fs from "fs";
import * as os from "os";

import { Command } from "../command";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import { validateOptions, serialExportUsers } from "../accountExporter";

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
    "Format of exported data (csv, json). Ignored if <dataFile> has format extension."
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
