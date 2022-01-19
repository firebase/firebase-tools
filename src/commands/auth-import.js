"use strict";

const _ = require("lodash");
const { parse } = require("csv-parse");
const clc = require("cli-color");
const fs = require("fs");
const jsonStream = require("JSONStream");

const { Command } = require("../command");
const { FirebaseError } = require("../error");
const { logger } = require("../logger");
const { requirePermissions } = require("../requirePermissions");
const accountImporter = require("../accountImporter");
const needProjectId = require("../projectUtils").needProjectId;
const utils = require("../utils");

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
    const stats = fs.statSync(dataFile);
    const fileSizeInBytes = stats.size;
    logger.info("Processing " + clc.bold(dataFile) + " (" + fileSizeInBytes + " bytes)");

    const inStream = fs.createReadStream(dataFile);
    const batches = [];
    let currentBatch = [];
    let counter = 0;
    const userListArr = await new Promise((resolve, reject) => {
      let parser;
      if (dataFile.endsWith(".csv")) {
        parser = parse();
        parser
          .on("readable", () => {
            let record;
            while ((record = parser.read()) !== null) {
              counter++;
              const trimmed = record.map((s) => {
                const str = s.trim().replace(/^["|'](.*)["|']$/, "$1");
                return str === "" ? undefined : str;
              });
              const user = transArrayToUser(trimmed);
              if (user.error) {
                return reject(
                  new FirebaseError(
                    `Line ${counter} (${record}) has invalid data format: ${user.error}`
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
      } else {
        parser = jsonStream.parse(["users", { emitKey: true }]);
        parser
          .on("data", (pair) => {
            counter++;
            var res = validateUserJson(pair.value);
            if (res.error) {
              return reject(new FirebaseError(res.error));
            }
            currentBatch.push(pair.value);
            if (currentBatch.length === MAX_BATCH_SIZE) {
              batches.push(currentBatch);
              currentBatch = [];
            }
          })
          .on("end", () => {
            if (currentBatch.length) {
              batches.push(currentBatch);
            }
            return resolve(batches);
          });
        inStream.pipe(parser);
      }
    });
    logger.debug(`Preparing to import ${counter} user records in ${userListArr.length} batches.`);
    if (userListArr.length) {
      return serialImportUsers(projectId, hashOptions, userListArr, 0);
    }
  });
