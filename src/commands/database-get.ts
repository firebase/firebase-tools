import * as _ from "lodash";
import * as fs from "fs";
import * as url from "url";

import { Command } from "../command";
import * as requireInstance from "../requireInstance";
import { requirePermissions } from "../requirePermissions";
import * as request from "request";
import * as api from "../api";
import * as responseToError from "../responseToError";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { Emulators } from "../emulator/types";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { populateInstanceDetails } from "../management/database";
import { realtimeOriginOrEmulatorOrCustomUrl } from "../database/api";
import * as utils from "../utils";

function applyStringOpts(dest: any, src: any, keys: string[], jsonKeys: string[]): void {
  _.forEach(keys, (key) => {
    if (src[key]) {
      dest[key] = src[key];
    }
  });

  // some keys need JSON encoding of the querystring value
  _.forEach(jsonKeys, (key) => {
    let jsonVal;
    try {
      jsonVal = JSON.parse(src[key]);
    } catch (e) {
      jsonVal = src[key];
    }

    if (src[key]) {
      dest[key] = JSON.stringify(jsonVal);
    }
  });
}

export default new Command("database:get <path>")
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
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .before(populateInstanceDetails)
  .before(printNoticeIfEmulated, Emulators.DATABASE)
  .action((path, options) => {
    if (!_.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }

    const dbHost = realtimeOriginOrEmulatorOrCustomUrl(options);
    let dbUrl = utils.getDatabaseUrl(dbHost, options.instance, path + ".json");
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
      ["orderBy", "startAt", "endAt", "equalTo"]
    );

    const urlObj = new url.URL(dbUrl);
    Object.keys(query).forEach((key) => {
      urlObj.searchParams.set(key, query[key]);
    });

    dbUrl = urlObj.href;

    logger.debug("Query URL: ", dbUrl);
    const reqOptions = {
      url: dbUrl,
    };

    return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
      return new Promise((resolve, reject) => {
        const fileOut = !!options.output;
        const outStream = fileOut ? fs.createWriteStream(options.output) : process.stdout;
        const writeOut = (s: Buffer | string, cb?: Function): void => {
          if (outStream === process.stdout) {
            outStream.write(s, cb);
          } else if (outStream instanceof fs.WriteStream) {
            outStream.write(s, (err) => {
              if (cb) {
                cb(err);
              }
            });
          }
        };
        let erroring = false;
        let errorResponse = "";
        let response: any;

        request
          .get(reqOptionsWithToken)
          .on("response", (res) => {
            response = res;
            if (response.statusCode >= 400) {
              erroring = true;
            }
          })
          .on("data", (chunk) => {
            if (erroring) {
              errorResponse += chunk;
            } else {
              writeOut(chunk);
            }
          })
          .on("end", () => {
            writeOut("\n", () => {
              resolve();
            });
            if (erroring) {
              try {
                const data = JSON.parse(errorResponse);
                return reject(responseToError(response, data));
              } catch (e) {
                return reject(
                  new FirebaseError("Malformed JSON response", {
                    exit: 2,
                    original: e,
                  })
                );
              }
            }
          })
          .on("error", reject);
      });
    });
  });
