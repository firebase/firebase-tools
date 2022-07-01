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

import * as fs from "fs";
import * as ora from "ora";
import * as readline from "readline";
import * as tmp from "tmp";
import AbortController from "abort-controller";

import { Client } from "./apiv2";
import { realtimeOriginOrEmulatorOrCustomUrl } from "./database/api";
import { logger } from "./logger";
import { ProfileReport, ProfileReportOptions } from "./profileReport";
import { responseToError } from "./responseToError";
import * as utils from "./utils";

tmp.setGracefulCleanup();

/**
 * Profiles a database.
 * @param options the CLI options object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function profiler(options: any): Promise<unknown> {
  const origin = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
  const url = new URL(utils.getDatabaseUrl(origin, options.instance, "/.settings/profile.json?"));
  const rl = readline.createInterface({ input: process.stdin });

  const fileOut = !!options.output;
  const tmpFile = tmp.tmpNameSync();
  const tmpStream = fs.createWriteStream(tmpFile);
  const outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
  const spinner = ora({
    text: "0 operations recorded. Press [enter] to stop",
    color: "yellow",
  });
  const outputFormat = options.raw ? "RAW" : options.parent.json ? "JSON" : "TXT";

  // Controller is used to stop the request stream when the user stops the
  // command or the duration passes.
  const controller = new AbortController();

  const generateReport = (): Promise<void> => {
    rl.close();
    spinner.stop();
    controller.abort();
    const dataFile = options.input || tmpFile;
    const reportOptions: ProfileReportOptions = {
      format: outputFormat,
      isFile: fileOut,
      isInput: !!options.input,
      collapse: options.collapse,
    };
    const report = new ProfileReport(dataFile, outStream, reportOptions);
    return report.generate();
  };

  if (options.input) {
    // If there is input, don't contact the server.
    return generateReport();
  }

  const c = new Client({ urlPrefix: url.origin, auth: true });
  const res = await c.request<unknown, NodeJS.ReadableStream>({
    method: "GET",
    path: url.pathname,
    responseType: "stream",
    resolveOnHTTPError: true,
    headers: {
      Accept: "text/event-stream",
    },
    signal: controller.signal,
  });

  if (res.response.status >= 400) {
    throw responseToError(res.response, await res.response.text());
  }

  if (!options.duration) {
    spinner.start();
  }

  let counter = 0;
  res.body.on("data", (chunk: Buffer) => {
    if (chunk.toString().includes("event: log")) {
      counter++;
      spinner.text = `${counter} operations recorded. Press [enter] to stop`;
    }
  });
  // If the response stream is closed, this handler is called (not
  // necessarially an error condition).
  res.body.on("end", () => {
    spinner.text = counter + " operations recorded.\n";
  });
  // If the duration passes or another exception happens, this handler is
  // called.
  let resError: Error | undefined;
  res.body.on("error", (e) => {
    if (e.type !== "aborted") {
      resError = e;
      logger.error("Unexpected error from response stream:", e);
    }
  });

  const p = new Promise((resolve, reject) => {
    const fn = (): void => {
      // Use the signal to stop the ongoing request.
      controller.abort();
      if (resError) {
        return reject(resError);
      }
      resolve(generateReport());
    };
    if (options.duration) {
      setTimeout(fn, options.duration * 1000);
    } else {
      // On newline, generate the report.
      rl.question("", fn);
    }
  });

  // With everything set, start the stream and return the promise.
  res.body.pipe(tmpStream);
  return p;
}
