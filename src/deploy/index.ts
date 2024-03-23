import * as clc from "colorette";
import { logger } from "../logger";
import { hostingOrigin } from "../api";
import { bold, underline, white } from "colorette";
import { includes, each } from "lodash";
import { needProjectId } from "../projectUtils";
import { logBullet, logSuccess, consoleUrl, addSubdomain } from "../utils";
import { FirebaseError } from "../error";
import { AnalyticsParams, trackGA4 } from "../track";
import { lifecycleHooks } from "./lifecycleHooks";
import * as experiments from "../experiments";
import * as HostingTarget from "./hosting";
import * as DatabaseTarget from "./database";
import * as FirestoreTarget from "./firestore";
import * as FunctionsTarget from "./functions";
import * as StorageTarget from "./storage";
import * as RemoteConfigTarget from "./remoteconfig";
import * as ExtensionsTarget from "./extensions";
import { prepareFrameworks } from "../frameworks";
import { HostingDeploy } from "./hosting/context";
import { addPinnedFunctionsToOnlyString, hasPinnedFunctions } from "./hosting/prepare";
import { isRunningInGithubAction } from "../init/features/hosting/github";
import { TARGET_PERMISSIONS } from "../commands/deploy";
import { requirePermissions } from "../requirePermissions";

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
  customContext = {},
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

  if (targetNames.includes("hosting")) {
    const config = options.config.get("hosting");
    if (Array.isArray(config) ? config.some((it) => it.source) : config.source) {
      experiments.assertEnabled("webframeworks", "deploy a web framework from source");
      await prepareFrameworks("deploy", targetNames, context, options);
    }
  }

  if (targetNames.includes("hosting") && hasPinnedFunctions(options)) {
    experiments.assertEnabled("pintags", "deploy a tagged function as a hosting rewrite");
    if (!targetNames.includes("functions")) {
      targetNames.unshift("functions");
      try {
        await requirePermissions(options, TARGET_PERMISSIONS["functions"]);
      } catch (e) {
        if (isRunningInGithubAction()) {
          throw new FirebaseError(
            "It looks like you are deploying a Hosting site along with Cloud Functions " +
              "using a GitHub action version that did not include Cloud Functions " +
              "permissions. Please reinstall the GitHub action with" +
              clc.bold("firebase init hosting:github"),
            { original: e as Error },
          );
        } else {
          throw e;
        }
      }
    }
    await addPinnedFunctionsToOnlyString(context, options);
  }

  for (const targetName of targetNames) {
    const target = TARGETS[targetName];

    if (!target) {
      return Promise.reject(new FirebaseError(`${bold(targetName)} is not a valid deploy target`));
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

  const duration = Date.now() - startTime;
  const analyticsParams: AnalyticsParams = {
    interactive: options.nonInteractive ? "false" : "true",
  };

  Object.keys(TARGETS).reduce((accum, t) => {
    accum[t] = "false";
    return accum;
  }, analyticsParams);
  for (const t of targetNames) {
    analyticsParams[t] = "true";
  }
  await trackGA4("product_deploy", analyticsParams, duration);

  logger.info();
  logSuccess(bold(underline("Deploy complete!")));
  logger.info();

  const deployedHosting = includes(targetNames, "hosting");
  logger.info(bold("Project Console:"), consoleUrl(options.project, "/overview"));
  if (deployedHosting) {
    each(context.hosting.deploys as HostingDeploy[], (deploy) => {
      logger.info(bold("Hosting URL:"), addSubdomain(hostingOrigin, deploy.config.site));
    });
    const versionNames = context.hosting.deploys.map((deploy: any) => deploy.version);
    return { hosting: versionNames.length === 1 ? versionNames[0] : versionNames };
  } else {
    return { hosting: undefined };
  }
};
