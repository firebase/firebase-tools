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
import * as DataConnectTarget from "./dataconnect";
import * as AppHostingTarget from "./apphosting";
import { prepareFrameworks } from "../frameworks";
import { Context as HostingContext } from "./hosting/context";
import { addPinnedFunctionsToOnlyString, hasPinnedFunctions } from "./hosting/prepare";
import { isRunningInGithubAction } from "../init/features/hosting/github";
import { TARGET_PERMISSIONS } from "../commands/deploy";
import { requirePermissions } from "../requirePermissions";
import { Options } from "../options";
import { HostingConfig } from "../firebaseConfig";
import {
  Context as DataConnectContext,
  DeployStats,
  deployStatsParams,
} from "./dataconnect/context";

const TARGETS = {
  hosting: HostingTarget,
  database: DatabaseTarget,
  firestore: FirestoreTarget,
  functions: FunctionsTarget,
  storage: StorageTarget,
  remoteconfig: RemoteConfigTarget,
  extensions: ExtensionsTarget,
  dataconnect: DataConnectTarget,
  apphosting: AppHostingTarget,
};

export type DeployOptions = Options & { dryRun?: boolean };

type Chain = ((context: any, options: any, payload: any) => Promise<unknown>)[];

const chain = async function (fns: Chain, context: any, options: any, payload: any): Promise<void> {
  for (const latest of fns) {
    await latest(context, options, payload);
  }
};

export const isDeployingWebFramework = (options: DeployOptions): boolean => {
  const config = options.config.get("hosting") as HostingConfig;
  if (!config) return false;

  const normalizedConfig = Array.isArray(config) ? config : [config];
  const webFrameworksInConfig = normalizedConfig.filter((c) => c?.source);

  // If no webframeworks are in config, a web framework is not being deployed
  if (webFrameworksInConfig.length === 0) return false;

  // If a web framework is present in config and no --only flag is present, a web framework is being deployed
  if (!options.only) return true;

  // If we're deploying a specific site/target when a web framework is present in config, check if the target is a web framework
  return options.only.split(",").some((it) => {
    const [target, site] = it.split(":");

    // If not deploying to Firebase Hosting, skip
    if (target !== "hosting") return false;

    // If no site specified but we're deploying to Firebase Hosting, a webframework is being deployed
    if (!site) return true;

    // If a site is specified, check if it's a web framework
    return webFrameworksInConfig.some((c) => [c.site, c.target].includes(site));
  });
};

/**
 * The `deploy()` function runs through a three step deploy process for a listed
 * number of deploy targets. This allows deploys to be done all together or
 * for individual deployable elements to be deployed as such.
 */
export const deploy = async function (
  targetNames: (keyof typeof TARGETS)[],
  options: DeployOptions,
  customContext = {},
) {
  const projectId = needProjectId(options);
  const payload = {};
  // a shared context object for deploy targets to decorate as needed
  const context: HostingContext & DataConnectContext = Object.assign({ projectId }, customContext);
  const predeploys: Chain = [];
  const prepares: Chain = [];
  const deploys: Chain = [];
  const releases: Chain = [];
  const postdeploys: Chain = [];
  const startTime = Date.now();

  if (targetNames.includes("hosting") && isDeployingWebFramework(options)) {
    experiments.assertEnabled("webframeworks", "deploy a web framework from source");
    await prepareFrameworks("deploy", targetNames, context, options);
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
    if (!options.dryRun) {
      deploys.push(target.deploy);
      releases.push(target.release);
      postdeploys.push(lifecycleHooks(targetName, "postdeploy"));
    }
  }

  logger.info();
  logger.info(bold(white("===") + " Deploying to '" + projectId + "'..."));
  logger.info();

  logBullet("deploying " + bold(targetNames.join(", ")));

  let result = "predeploys_error";
  try {
    await chain(predeploys, context, options, payload);
    result = "prepares_error";
    await chain(prepares, context, options, payload);
    result = "deploys_error";
    await chain(deploys, context, options, payload);
    result = "releases_error";
    await chain(releases, context, options, payload);
    result = "postdeploys_error";
    await chain(postdeploys, context, options, payload);
    result = "success";
  } finally {
    const baseParams: AnalyticsParams = {
      interactive: options.nonInteractive ? "false" : "true",
      dry_run: options.dryRun ? "true" : "false",
      result: result,
    };
    const duration = Date.now() - startTime;
    const params = Object.assign({}, baseParams);
    Object.keys(TARGETS).reduce((accum, t) => {
      accum[t] = "false";
      return accum;
    }, params);
    for (const t of targetNames) {
      params[t] = "true";
    }
    void trackGA4("product_deploy", params, duration);

    const stats: DeployStats | undefined = context?.dataconnect?.deployStats;
    if (stats) {
      const fdcParams = deployStatsParams(stats);
      void trackGA4("dataconnect_deploy", { ...fdcParams, ...baseParams }, duration);
    }
  }

  const successMessage = options.dryRun ? "Dry run complete!" : "Deploy complete!";
  logger.info();
  logSuccess(bold(underline(successMessage)));
  logger.info();

  const deployedHosting = includes(targetNames, "hosting");
  logger.info(bold("Project Console:"), consoleUrl(options.project ?? "_", "/overview"));
  if (deployedHosting) {
    each(context.hosting?.deploys, (deploy) => {
      logger.info(bold("Hosting URL:"), addSubdomain(hostingOrigin(), deploy.config.site));
    });
    const versionNames = context.hosting?.deploys.map((deploy: any) => deploy.version);
    return { hosting: versionNames?.length === 1 ? versionNames[0] : versionNames };
  } else {
    return { hosting: undefined };
  }
};
