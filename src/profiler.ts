import * as fs from "fs";
import * as ora from "ora";
import * as readline from "readline";
import * as tmp from "tmp";
import AbortController from "abort-controller";

import { Client } from "./apiv2";
import { realtimeOriginOrEmulatorOrCustomUrl } from "./database/api";
import * as logger from "./logger";
import * as ProfileReport from "./profileReport";
import * as responseToError from "./responseToError";
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
    const reportOptions = {
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
