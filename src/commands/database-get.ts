import * as fs from "fs";
import * as url from "url";

import { Client } from "../apiv2";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import { populateInstanceDetails } from "../management/database";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { responseToError } from "../responseToError";
import * as utils from "../utils";

/**
 * Copies any `keys` from `src` to `dest`. Then copies any `jsonKeys` from
 * `src` as JSON strings to `dest`. Modifies `dest`.
 * @param dest destination object.
 * @param src source to read from for `keys` and `jsonKeys`.
 * @param keys keys to copy from `src`.
 * @param jsonKeys keys to copy as JSON strings from `src`.
 */
function applyStringOpts(
  dest: { [key: string]: string },
  src: { [key: string]: string },
  keys: string[],
  jsonKeys: string[],
): void {
  for (const key of keys) {
    if (src[key]) {
      dest[key] = src[key];
    }
  }
  // some keys need JSON encoding of the querystring value
  for (const key of jsonKeys) {
    let jsonVal;
    try {
      jsonVal = JSON.parse(src[key]);
    } catch (_) {
      jsonVal = src[key];
    }
    if (src[key]) {
      dest[key] = JSON.stringify(jsonVal);
    }
  }
}

export const command = new Command("database:get <path>")
  .description("fetch and print JSON data at the specified path")
  .option("-o, --output <filename>", "save output to the specified file")
  .option("--pretty", "pretty print response")
  .option("--shallow", "return shallow response")
  .option("--export", "include priorities in the output response")
  .option("--order-by <key>", "select a child key by which to order results")
  .option("--order-by-key", "order by key name")
  .option("--order-by-value", "order by primitive value")
  .option("--limit-to-first <num>", "limit to the first <num> results")
  .option("--limit-to-last <num>", "limit to the last <num> results")
  .option("--start-at <val>", "start results at <val> (based on specified ordering)")
  .option("--end-at <val>", "end results at <val> (based on specified ordering)")
  .option("--equal-to <val>", "restrict results to <val> (based on specified ordering)")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)",
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireDatabaseInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async (path: string, options: any) => {
    if (!path.startsWith("/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }

    const dbHost = realtimeOriginOrEmulatorOrCustomUrl(options.instanceDetails.databaseUrl);
    const dbUrl = utils.getDatabaseUrl(dbHost, options.instance, path + ".json");
    const query: { [key: string]: string } = {};
    if (options.shallow) {
      query.shallow = "true";
    }
    if (options.pretty) {
      query.print = "pretty";
    }
    if (options.export) {
      query.format = "export";
    }
    if (options.orderByKey) {
      options.orderBy = "$key";
    }
    if (options.orderByValue) {
      options.orderBy = "$value";
    }
    applyStringOpts(
      query,
      options,
      ["limitToFirst", "limitToLast"],
      ["orderBy", "startAt", "endAt", "equalTo"],
    );

    const urlObj = new url.URL(dbUrl);
    const client = new Client({
      urlPrefix: urlObj.origin,
      auth: true,
    });
    const res = await client.request<unknown, NodeJS.ReadableStream>({
      method: "GET",
      path: urlObj.pathname,
      queryParams: query,
      responseType: "stream",
      resolveOnHTTPError: true,
    });

    const fileOut = !!options.output;
    const outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;

    if (res.status >= 400) {
      // TODO(bkendall): consider moving stream-handling logic to responseToError.
      const r = await res.response.text();
      let d;
      try {
        d = JSON.parse(r);
      } catch (e: any) {
        throw new FirebaseError("Malformed JSON response", { original: e, exit: 2 });
      }
      throw responseToError({ statusCode: res.status }, d);
    }

    res.body.pipe(outStream, { end: false });

    return new Promise<void>((resolve) => {
      // Tack on a single newline at the end of the stream.
      res.body.once("end", () => {
        if (outStream === process.stdout) {
          // `stdout` can simply be written to.
          outStream.write("\n");
          resolve();
        } else if (outStream instanceof fs.WriteStream) {
          outStream.write("\n");
          outStream.on("close", () => resolve());
          outStream.close();
        } else {
          logger.debug("[database:get] Could not write line break to outStream");
          resolve();
        }
      });
    });
  });
