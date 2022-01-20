/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs-extra";
import { parse } from "csv-parse";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import * as accountImporter from "../accountImporter";
import { needProjectId } from "../projectUtils";
import * as utils from "../utils";

const MAX_BATCH_SIZE = 1000;
const validateOptions = accountImporter.validateOptions;
const validateUserJson = accountImporter.validateUserJson;
const transArrayToUser = accountImporter.transArrayToUser;
const serialImportUsers = accountImporter.serialImportUsers;

module.exports = new Command("auth:import [dataFile]")
  .description("import users into your Firebase project from a data file(.csv or .json)")
  .option(
    "--hash-algo <hashAlgo>",
    "specify the hash algorithm used in password for these accounts"
  )
  .option("--hash-key <hashKey>", "specify the key used in hash algorithm")
  .option(
    "--salt-separator <saltSeparator>",
    "specify the salt separator which will be appended to salt when verifying password. only used by SCRYPT now."
  )
  .option("--rounds <rounds>", "specify how many rounds for hash calculation.")
  .option(
    "--mem-cost <memCost>",
    "specify the memory cost for firebase scrypt, or cpu/memory cost for standard scrypt"
  )
  .option("--parallelization <parallelization>", "specify the parallelization for standard scrypt.")
  .option("--block-size <blockSize>", "specify the block size (normally is 8) for standard scrypt.")
  .option("--dk-len <dkLen>", "specify derived key length for standard scrypt.")
  .option(
    "--hash-input-order <hashInputOrder>",
    "specify the order of password and salt. Possible values are SALT_FIRST and PASSWORD_FIRST. " +
      "MD5, SHA1, SHA256, SHA512, HMAC_MD5, HMAC_SHA1, HMAC_SHA256, HMAC_SHA512 support this flag."
  )
  .before(requirePermissions, ["firebaseauth.users.create", "firebaseauth.users.update"])
  .action(async (dataFile, options) => {
    const projectId = needProjectId(options);
    const checkRes = validateOptions(options);
    if (!checkRes.valid) {
      return checkRes;
    }
    const hashOptions = checkRes;

    if (!_.endsWith(dataFile, ".csv") && !_.endsWith(dataFile, ".json")) {
      return utils.reject("Data file must end with .csv or .json", { exit: 1 });
    }
    const stats = await fs.stat(dataFile);
    const fileSizeInBytes = stats.size;
    logger.info("Processing " + clc.bold(dataFile) + " (" + fileSizeInBytes + " bytes)");

    const batches: any[] = [];
    let currentBatch: any[] = [];
    let counter = 0;
    let userListArr: any[] = [];
    if (dataFile.endsWith(".csv")) {
      userListArr = await new Promise<any[]>((resolve, reject) => {
        const inStream = fs.createReadStream(dataFile);
        const parser = parse();
        parser
          .on("readable", () => {
            let record: string[] = [];
            while ((record = parser.read()) !== null) {
              counter++;
              const trimmed = record.map((s) => {
                const str = s.trim().replace(/^["|'](.*)["|']$/, "$1");
                return str === "" ? undefined : str;
              });
              const user = transArrayToUser(trimmed);
              if (_.get(user, "error")) {
                return reject(
                  new FirebaseError(
                    `Line ${counter} (${record}) has invalid data format: ${_.get(user, "error")}`
                  )
                );
              }
              currentBatch.push(user);
              if (currentBatch.length === MAX_BATCH_SIZE) {
                batches.push(currentBatch);
                currentBatch = [];
              }
            }
          })
          .on("end", () => {
            if (currentBatch.length) {
              batches.push(currentBatch);
            }
            resolve(batches);
          });
        inStream.pipe(parser);
      });
    } else {
      const fileContent = await fs.readFile(dataFile, "utf-8");
      const data = JSON.parse(fileContent).users;
      for (const user of data) {
        counter++;
        const res = validateUserJson(user);
        if (res.error) {
          throw new FirebaseError(res.error);
        }
        currentBatch.push(user);
        if (currentBatch.length === MAX_BATCH_SIZE) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }
      if (currentBatch.length) {
        batches.push(currentBatch);
      }
      userListArr = batches;
    }

    logger.debug(`Preparing to import ${counter} user records in ${userListArr.length} batches.`);
    if (userListArr.length) {
      return serialImportUsers(projectId, hashOptions, userListArr, 0);
    }
  });
