import * as archiver from "archiver";
import * as clc from "colorette";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import * as backend from "./backend";
import * as functionsConfig from "../../functionsConfig";
import * as utils from "../../utils";
import * as projectConfig from "../../functions/projectConfig";
import { prepareSource } from "./packaging/prepareSource";

interface PackagedSourceInfo {
  pathToSource: string;
  hash: string;
}

type SortedConfig = string | { key: string; value: SortedConfig }[];

// TODO(inlined): move to a file that's not about uploading source code
/**
 *
 */
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
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}

async function packageSource(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig: any
): Promise<PackagedSourceInfo | undefined> {
  const { hash, dir } = await prepareSource(sourceDir, config, runtimeConfig);
  const tmpFile = tmp.fileSync({ name: `${path.basename(dir)}.zip` }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");
  archive.directory(dir, false);
  await pipeAsync(archive, fileStream);

  // Delete tmp directory
  fs.rmSync(dir, { recursive: true });

  utils.logBullet(
    clc.cyan(clc.bold("functions:")) +
      " packaged " +
      clc.bold(sourceDir) +
      " (" +
      filesize(archive.pointer()) +
      ") for uploading"
  );
  return { pathToSource: tmpFile, hash };
}

/**
 *
 */
export async function prepareFunctionsUpload(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig?: backend.RuntimeConfigValues
): Promise<PackagedSourceInfo | undefined> {
  return packageSource(sourceDir, config, runtimeConfig);
}

/**
 *
 */
export function convertToSortedKeyValueArray(config: any): SortedConfig {
  if (typeof config !== "object" || config === null) return config;

  return Object.keys(config)
    .sort()
    .map((key) => {
      return { key, value: convertToSortedKeyValueArray(config[key]) };
    });
}
