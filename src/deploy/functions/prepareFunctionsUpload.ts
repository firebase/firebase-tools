import * as _ from "lodash";
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
import * as args from "./args";
import { Options } from "../../options";
import { Config } from "../../config";

const CONFIG_DEST_FILE = ".runtimeconfig.json";

// TODO(inlined): move to a file that's not about uploading source code
export async function getFunctionsConfig(context: args.Context): Promise<{ [key: string]: any }> {
  let config: Record<string, any> = {};
  if (context.runtimeConfigEnabled) {
    try {
      config = await functionsConfig.materializeAll(context.firebaseConfig!.projectId);
    } catch (err) {
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
      config = {};
    }
  }

  config.firebase = context.firebaseConfig;
  return config;
}

// TODO(inlined): move to a file that's not about uploading source code
export async function getEnvs(context: args.Context): Promise<{ [key: string]: string }> {
  const envs = {
    FIREBASE_CONFIG: JSON.stringify(context.firebaseConfig),
  };
  return Promise.resolve(envs);
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream) {
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
}

async function packageSource(options: Options, sourceDir: string, configValues: any) {
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
  const ignore = options.config.src.functions?.ignore || ["node_modules", ".git"];
  ignore.push(
    "firebase-debug.log",
    "firebase-debug.*.log",
    CONFIG_DEST_FILE /* .runtimeconfig.json */
  );
  try {
    const files = await fsAsync.readdirRecursive({ path: sourceDir, ignore: ignore });
    _.forEach(files, (file) => {
      archive.file(file.name, {
        name: path.relative(sourceDir, file.name),
        mode: file.mode,
      });
    });
    archive.append(JSON.stringify(configValues, null, 2), {
      name: CONFIG_DEST_FILE,
      mode: 420 /* 0o644 */,
    });
    archive.finalize();
    await pipeAsync(archive, fileStream);
  } catch (err) {
    throw new FirebaseError(
      "Could not read source directory. Remove links and shortcuts and try again.",
      {
        original: err,
        exit: 1,
      }
    );
  }

  utils.assertDefined(options.config.src.functions);
  utils.assertDefined(
    options.config.src.functions.source,
    "Error: 'functions.source' is not defined"
  );
  utils.logBullet(
    clc.cyan.bold("functions:") +
      " packaged " +
      clc.bold(options.config.src.functions.source) +
      " (" +
      filesize(archive.pointer()) +
      ") for uploading"
  );
  return tmpFile;
}

export async function prepareFunctionsUpload(
  runtimeConfig: backend.RuntimeConfigValues,
  options: Options
): Promise<string | undefined> {
  utils.assertDefined(options.config.src.functions);
  utils.assertDefined(
    options.config.src.functions.source,
    "Error: 'functions.source' is not defined"
  );

  const sourceDir = options.config.path(options.config.src.functions.source);
  return packageSource(options, sourceDir, runtimeConfig);
}
