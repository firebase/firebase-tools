import * as archiver from "archiver";
import * as clc from "colorette";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { getSourceHash } from "./cache/hash";
import * as backend from "./backend";
import * as functionsConfig from "../../functionsConfig";
import * as utils from "../../utils";
import * as fsAsync from "../../fsAsync";
import * as projectConfig from "../../functions/projectConfig";

const CONFIG_DEST_FILE = ".runtimeconfig.json";

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
          "\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project.",
      );
    }
  }
  return {};
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream) {
  from.pipe(to);
  await from.finalize();
  return new Promise<void>((resolve, reject) => {
    to.on("finish", () => resolve());
    to.on("error", reject);
  });
}

async function packageSource(
  projectDir: string,
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  additionalSources: string[],
  runtimeConfig: any,
  options?: { exportType: "zip" | "tar.gz" },
): Promise<PackagedSourceInfo | undefined> {
  const exportType = options?.exportType || "zip";
  const postfix = exportType === "tar.gz" ? ".tar.gz" : ".zip";
  const tmpFile = tmp.fileSync({ prefix: "firebase-functions-", postfix }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = exportType === "tar.gz" ? archiver("tar", { gzip: true }) : archiver("zip");
  const hashes: string[] = [];

  // We must ignore firebase-debug.log or weird things happen if
  // you're in the public dir when you deploy.
  // We ignore any CONFIG_DEST_FILE that already exists, and write another one
  // with current config values into the archive in the "end" handler for reader
  const ignore = config.ignore || ["node_modules", ".git"];
  ignore.push(
    "firebase-debug.log",
    "firebase-debug.*.log",
    CONFIG_DEST_FILE /* .runtimeconfig.json */,
  );
  try {
    const files = await fsAsync.readdirRecursive({ path: sourceDir, ignore: ignore });
    for (const file of files) {
      const name = path.relative(sourceDir, file.name);
      const fileHash = await getSourceHash(file.name);
      hashes.push(fileHash);
      archive.file(file.name, {
        name,
        mode: file.mode,
      });
    }
    for (const name of additionalSources) {
      const absPath = utils.resolveWithin(projectDir, name);
      if (!fs.existsSync(absPath)) {
        throw new FirebaseError(clc.bold(absPath) + " does not exist.", { exit: 1 });
      }
      const mode = fs.statSync(absPath).mode;
      const fileHash = await getSourceHash(absPath);
      hashes.push(fileHash);
      archive.file(absPath, {
        name,
        mode,
      });
    }
    if (typeof runtimeConfig !== "undefined") {
      // In order for hash to be consistent, configuration object tree must be sorted by key, only possible with arrays.
      const runtimeConfigHashString = JSON.stringify(convertToSortedKeyValueArray(runtimeConfig));
      hashes.push(runtimeConfigHashString);

      const runtimeConfigString = JSON.stringify(runtimeConfig, null, 2);
      archive.append(runtimeConfigString, {
        name: CONFIG_DEST_FILE,
        mode: 420 /* 0o644 */,
      });

      // Only warn about deprecated runtime config if there are user-defined values
      // (i.e., keys other than the default 'firebase' key)
      if (Object.keys(runtimeConfig).some((k) => k !== "firebase")) {
        functionsConfig.logFunctionsConfigDeprecationWarning();
      }
    }
    await pipeAsync(archive, fileStream);
  } catch (err: any) {
    if (err instanceof FirebaseError) {
      // No need to wrap these again.
      throw err;
    }
    throw new FirebaseError(
      "Could not read source directory. Remove links and shortcuts and try again.",
      {
        original: err,
        exit: 1,
      },
    );
  }

  utils.logBullet(
    clc.cyan(clc.bold("functions:")) +
      " packaged " +
      clc.bold(sourceDir) +
      " (" +
      filesize(archive.pointer()) +
      ") for uploading",
  );
  const hash = hashes.join(".");
  return { pathToSource: tmpFile, hash };
}

/**
 *
 */
export async function prepareFunctionsUpload(
  projectDir: string,
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  additionalSources: string[],
  runtimeConfig?: backend.RuntimeConfigValues,
  options?: { exportType: "zip" | "tar.gz" },
): Promise<PackagedSourceInfo | undefined> {
  return packageSource(projectDir, sourceDir, config, additionalSources, runtimeConfig, options);
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
