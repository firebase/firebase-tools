import * as _ from "lodash";
import * as archiver from "archiver";
import * as clc from "cli-color";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { FirebaseError } from "./error";
import * as functionsConfig from "./functionsConfig";
import * as getProjectId from "./getProjectId";
import * as logger from "./logger";
import * as utils from "./utils";
import * as parseTriggers from "./parseTriggers";
import * as fsAsync from "./fsAsync";

const CONFIG_DEST_FILE = ".runtimeconfig.json";

async function getFunctionsConfig(context: any): Promise<{ [key: string]: any }> {
  let config = {};
  if (context.runtimeConfigEnabled) {
    try {
      config = await functionsConfig.materializeAll(context.firebaseConfig.projectId);
    } catch (err) {
      logger.debug(err);
      const errorCode = _.get(err, "context.response.statusCode");
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

  const firebaseConfig = _.get(context, "firebaseConfig");
  _.set(config, "firebase", firebaseConfig);
  return config;
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream) {
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
}

async function packageSource(options: any, sourceDir: string, configValues: any) {
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
  const ignore = options.config.get("functions.ignore", ["node_modules", ".git"]);
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
  utils.logBullet(
    clc.cyan.bold("functions:") +
      " packaged " +
      clc.bold(options.config.get("functions.source")) +
      " (" +
      filesize(archive.pointer()) +
      ") for uploading"
  );
  return {
    file: tmpFile,
    stream: fs.createReadStream(tmpFile),
    size: archive.pointer(),
  };
}

export async function prepareFunctionsUpload(context: any, options: any) {
  const sourceDir = options.config.path(options.config.get("functions.source"));
  const configValues = await getFunctionsConfig(context);
  const triggers = await parseTriggers(getProjectId(options), sourceDir, configValues);
  options.config.set("functions.triggers", triggers);
  if (triggers.length === 0) {
    // No need to package if there are 0 functions to deploy.
    return;
  }
  return packageSource(options, sourceDir, configValues);
}
