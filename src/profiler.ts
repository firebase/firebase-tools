import * as _ from "lodash";
import * as fs from "fs";
import * as ora from "ora";
import * as readline from "readline";
import * as tmp from "tmp";
import AbortController from "abort-controller";

import { Client } from "./apiv2";
import { realtimeOriginOrEmulatorOrCustomUrl } from "./database/api";
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
  const origin = realtimeOriginOrEmulatorOrCustomUrl(options);
  const url = new URL(utils.getDatabaseUrl(origin, options.instance, "/.settings/profile.json?"));
  const rl = readline.createInterface({ input: process.stdin });

  const fileOut = !!options.output;
  const tmpFile = tmp.tmpNameSync();
  const tmpStream = fs.createWriteStream(tmpFile);
  const outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
  let counter = 0;
  const spinner = ora({
    text: "0 operations recorded. Press [enter] to stop",
    color: "yellow",
  });
  const outputFormat = options.raw ? "RAW" : options.parent.json ? "JSON" : "TXT";
  const controller = new AbortController();

  const generateReport = _.once(() => {
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
    report.generate();
  });

  if (options.input) {
    // If there is input, don't contact the server
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
      Connection: "keep-alive",
    },
    signal: controller.signal,
  });

  if (res.response.status >= 400) {
    throw responseToError(res.response, await res.response.text());
  }

  if (!options.duration) {
    spinner.start();
  }

  res.body.on("data", (chunk: Buffer) => {
    if (chunk.toString().includes("event: log")) {
      counter++;
      spinner.text = `${counter} operations recorded. Press [enter] to stop`;
    }
  });
  // if (!options.duration) {
  //   res.body.on("end", () => {
  //     spinner.text = counter + " operations recorded.\n";
  //     generateReport();
  //   });
  // }

  res.body.on("error", (e) => {
    if (e.name !== "AbortError") {
      console.error("Error", e);
    }
  });

  res.body.pipe(tmpStream);

  return new Promise((resolve) => {
    const fn = (): void => {
      generateReport();
      resolve();
    };
    if (options.duration) {
      setTimeout(fn, options.duration * 1000);
    } else {
      // On newline, generate the report.
      rl.question("", fn);
    }
  });
}
