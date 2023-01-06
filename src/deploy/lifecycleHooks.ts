import * as utils from "../utils";
import * as clc from "colorette";
import * as childProcess from "child_process";
import { FirebaseError } from "../error";
const needProjectId = require("../projectUtils").needProjectId;
import { logger } from "../logger";
import * as path from "path";
import { Options } from "../options";

function runCommand(command: string, childOptions: childProcess.SpawnOptions) {
  const escapedCommand = command.replace(/\"/g, '\\"');
  const translatedCommand =
    '"' +
    process.execPath +
    '" "' +
    path.resolve(require.resolve("cross-env"), "..", "bin", "cross-env-shell.js") +
    '" "' +
    escapedCommand +
    '"';

  return new Promise<void>((resolve, reject) => {
    logger.info("Running command: " + command);
    if (translatedCommand === "") {
      return resolve();
    }
    const child = childProcess.spawn(translatedCommand, [], childOptions);
    child.on("error", (err) => {
      reject(err);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error("Command terminated with signal " + signal));
      } else if (code !== 0) {
        reject(new Error("Command terminated with non-zero exit code " + code));
      } else {
        resolve();
      }
    });
  });
}

function getChildEnvironment(target: string, overallOptions: any, config: any) {
  // active project ID
  const projectId = needProjectId(overallOptions);
  // root directory where firebase.json can be found
  const projectDir = overallOptions.projectRoot;
  // location of hosting site or functions deploy, defaults project directory
  let resourceDir;
  switch (target) {
    case "hosting":
      resourceDir = overallOptions.config.path(config.public ?? config.source);
      break;
    case "functions":
      resourceDir = overallOptions.config.path(config.source);
      break;
    default:
      resourceDir = overallOptions.config.path(overallOptions.config.projectDir);
  }

  // Copying over environment variables
  return Object.assign({}, process.env, {
    GCLOUD_PROJECT: projectId,
    PROJECT_DIR: projectDir,
    RESOURCE_DIR: resourceDir,
  });
}

function runTargetCommands(
  target: string,
  hook: string,
  overallOptions: any,
  config: any
): Promise<void> {
  let commands = config[hook];
  if (!commands) {
    return Promise.resolve();
  }
  if (typeof commands === "string") {
    commands = [commands];
  }

  const childOptions = {
    cwd: overallOptions.config.projectDir,
    env: getChildEnvironment(target, overallOptions, config),
    shell: true,
    stdio: [0, 1, 2], // Inherit STDIN, STDOUT, and STDERR
  };

  const runAllCommands = commands.reduce((soFar: Promise<unknown>, command: string) => {
    return soFar.then(() => runCommand(command, childOptions));
  }, Promise.resolve());

  // We currently use the resource name in info logs in the rest of the deploy.
  // However we don't have access to that here because predeploy hooks will
  // happen before we figure that out.  Internal bug tracking number: 123715324
  let logIdentifier = target;
  if (config.target) {
    logIdentifier += `[${config.target}]`;
  }

  return runAllCommands
    .then(() => {
      utils.logSuccess(
        clc.green(clc.bold(logIdentifier + ":")) +
          " Finished running " +
          clc.bold(hook) +
          " script."
      );
    })
    .catch((err: any) => {
      throw new FirebaseError(logIdentifier + " " + hook + " error: " + err.message);
    });
}

function getReleventConfigs(target: string, options: Options) {
  let targetConfigs = options.config.get(target);
  if (!targetConfigs) {
    return [];
  }
  if (!Array.isArray(targetConfigs)) {
    targetConfigs = [targetConfigs];
  }

  if (!options.only) {
    return targetConfigs;
  }

  let onlyTargets = options.only.split(",");
  if (onlyTargets.includes(target)) {
    // If the target matches entirely then all instances should be included.
    return targetConfigs;
  }

  onlyTargets = onlyTargets
    .filter((individualOnly) => {
      return individualOnly.indexOf(`${target}:`) === 0;
    })
    .map((individualOnly) => {
      return individualOnly.replace(`${target}:`, "");
    });

  return targetConfigs.filter((config: any) => {
    return !config.target || onlyTargets.includes(config.target);
  });
}

export function lifecycleHooks(
  target: string,
  hook: string
): (context: any, options: Options) => Promise<void> {
  return function (context: any, options: Options) {
    return getReleventConfigs(target, options).reduce(
      (previousCommands: Promise<unknown>, individualConfig: any) => {
        return previousCommands.then(() => {
          return runTargetCommands(target, hook, options, individualConfig);
        });
      },
      Promise.resolve()
    );
  };
}
