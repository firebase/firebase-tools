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

import * as archiver from "archiver";
import * as clc from "cli-color";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import * as backend from "./backend";
import * as functionsConfig from "../../functionsConfig";
import * as utils from "../../utils";
import * as fsAsync from "../../fsAsync";
import * as projectConfig from "../../functions/projectConfig";

const CONFIG_DEST_FILE = ".runtimeconfig.json";

// TODO(inlined): move to a file that's not about uploading source code
export async function getFunctionsConfig(projectId: string): Promise<Record<string, unknown>> {
  try {
    return await functionsConfig.materializeAll(projectId);
  } catch (err: any) {
    logger.debug(err);
    let errorCode = err?.context?.response?.statusCode;
    if (!errorCode) {
      logger.debug("Got unexpected error from Runtime Config; it has no status code:", err);
      errorCode = 500;
    }
    if (errorCode === 500 || errorCode === 503) {
      throw new FirebaseError(
        "Cloud Runtime Config is currently experiencing issues, " +
          "which is preventing your functions from being deployed. " +
          "Please wait a few minutes and then try to deploy your functions again." +
          "\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project."
      );
    }
  }
  return {};
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream) {
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
}

async function packageSource(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig: any
) {
  const tmpFile = tmp.fileSync({ prefix: "firebase-functions-", postfix: ".zip" }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");

  // We must ignore firebase-debug.log or weird things happen if
  // you're in the public dir when you deploy.
  // We ignore any CONFIG_DEST_FILE that already exists, and write another one
  // with current config values into the archive in the "end" handler for reader
  const ignore = config.ignore || ["node_modules", ".git"];
  ignore.push(
    "firebase-debug.log",
    "firebase-debug.*.log",
    CONFIG_DEST_FILE /* .runtimeconfig.json */
  );
  try {
    const files = await fsAsync.readdirRecursive({ path: sourceDir, ignore: ignore });
    for (const file of files) {
      archive.file(file.name, {
        name: path.relative(sourceDir, file.name),
        mode: file.mode,
      });
    }
    if (typeof runtimeConfig !== "undefined") {
      archive.append(JSON.stringify(runtimeConfig, null, 2), {
        name: CONFIG_DEST_FILE,
        mode: 420 /* 0o644 */,
      });
    }
    archive.finalize();
    await pipeAsync(archive, fileStream);
  } catch (err: any) {
    throw new FirebaseError(
      "Could not read source directory. Remove links and shortcuts and try again.",
      {
        original: err,
        exit: 1,
      }
    );
  }

  utils.logBullet(
    clc.cyan.bold("functions:") +
      " packaged " +
      clc.bold(sourceDir) +
      " (" +
      filesize(archive.pointer()) +
      ") for uploading"
  );
  return tmpFile;
}

export async function prepareFunctionsUpload(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig?: backend.RuntimeConfigValues
): Promise<string | undefined> {
  return packageSource(sourceDir, config, runtimeConfig);
}
