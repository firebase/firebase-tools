import { logger } from "../logger";
import { hostingOrigin } from "../api";
import { bold, white } from "cli-color";
import { has, includes, each } from "lodash";
import { needProjectId } from "../projectUtils";
import { logBullet, logSuccess, consoleUrl, addSubdomain } from "../utils";
import { FirebaseError } from "../error";
import { track } from "../track";
import * as lifecycleHooks from "./lifecycleHooks";
import { previews } from "../previews";
import * as HostingTarget from "./hosting";
import * as DatabaseTarget from "./database";
import * as FirestoreTarget from "./firestore";
import * as FunctionsTarget from "./functions";
import * as StorageTarget from "./storage";
import * as RemoteConfigTarget from "./remoteconfig";
import * as ExtensionsTarget from "./extensions";

const TARGETS = {
  hosting: HostingTarget,
  database: DatabaseTarget,
  firestore: FirestoreTarget,
  functions: FunctionsTarget,
  storage: StorageTarget,
  remoteconfig: RemoteConfigTarget,
  extensions: ExtensionsTarget,
};

type Chain = ((context: any, options: any, payload: any) => Promise<unknown>)[];

const chain = async function (fns: Chain, context: any, options: any, payload: any): Promise<void> {
  for (const latest of fns) {
    await latest(context, options, payload);
  }
};

/**
 * The `deploy()` function runs through a three step deploy process for a listed
 * number of deploy targets. This allows deploys to be done all together or
 * for individual deployable elements to be deployed as such.
 */
export const deploy = async function (
  targetNames: (keyof typeof TARGETS)[],
  options: any,
  customContext = {}
) {
  const projectId = needProjectId(options);
  const payload = {};
  // a shared context object for deploy targets to decorate as needed
  const context: any = Object.assign({ projectId }, customContext);
  const predeploys: Chain = [];
  const prepares: Chain = [];
  const deploys: Chain = [];
  const releases: Chain = [];
  const postdeploys: Chain = [];
  const startTime = Date.now();

  if (previews.frameworkawareness && targetNames.includes("hosting")) {
    const config = options.config.get("hosting");
    if (Array.isArray(config) ? config.some((it) => it.source) : config.source) {
      await require("firebase-frameworks").prepare(targetNames, context, options);
    }
  }

  for (const targetName of targetNames) {
    const target = TARGETS[targetName];

    if (!target) {
      return Promise.reject(
        new FirebaseError(bold(targetName) + " is not a valid deploy target", { exit: 1 })
      );
    }

    predeploys.push(lifecycleHooks(targetName, "predeploy"));
    prepares.push(target.prepare);
    deploys.push(target.deploy);
    releases.push(target.release);
    postdeploys.push(lifecycleHooks(targetName, "postdeploy"));
  }

  logger.info();
  logger.info(bold(white("===") + " Deploying to '" + projectId + "'..."));
  logger.info();

  logBullet("deploying " + bold(targetNames.join(", ")));

  await chain(predeploys, context, options, payload);
  await chain(prepares, context, options, payload);
  await chain(deploys, context, options, payload);
  await chain(releases, context, options, payload);
  await chain(postdeploys, context, options, payload);

  if (has(options, "config.notes.databaseRules")) {
    await track("Rules Deploy", options.config.notes.databaseRules);
  }

  const duration = Date.now() - startTime;
  await track("Product Deploy", [...targetNames].sort().join(","), duration);

  logger.info();
  logSuccess(bold.underline("Deploy complete!"));
  logger.info();

  const deployedHosting = includes(targetNames, "hosting");
  logger.info(bold("Project Console:"), consoleUrl(options.project, "/overview"));
  if (deployedHosting) {
    each(context.hosting.deploys, (deploy) => {
      logger.info(bold("Hosting URL:"), addSubdomain(hostingOrigin, deploy.site));
    });
    const versionNames = context.hosting.deploys.map((deploy: any) => deploy.version);
    return { hosting: versionNames.length === 1 ? versionNames[0] : versionNames };
  } else {
    return { hosting: undefined };
  }
};
