import * as planner from "./planner";
import * as deploymentSummary from "./deploymentSummary";
import * as prompt from "../../prompt";
import * as refs from "../../extensions/refs";
import { getAliases, needProjectId, needProjectNumber } from "../../projectUtils";
import { logger } from "../../logger";
import { Context, Payload } from "./args";
import { FirebaseError } from "../../error";
import { requirePermissions } from "../../requirePermissions";
import { ensureExtensionsApiEnabled } from "../../extensions/extensionsHelper";
import { ensureSecretManagerApiEnabled } from "../../extensions/secretsUtils";
import { checkSpecForSecrets } from "./secrets";
import { displayWarningsForDeploy, outOfBandChangesWarning } from "../../extensions/warnings";
import { detectEtagChanges } from "../../extensions/etags";
import { checkSpecForV2Functions, ensureNecessaryV2ApisAndRoles } from "./v2FunctionHelper";
import { acceptLatestAppDeveloperTOS, getAppDeveloperTOSStatus } from "../../extensions/tos";
import {
  extractExtensionsFromBuilds,
  extensionMatchesAnyFilter,
} from "../../extensions/runtimes/common";
import { Build } from "../functions/build";
import { getEndpointFilters } from "../functions/functionsDeployHelper";
import { DeployOptions } from "..";

const matchesInstanceId = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId;
};

const isUpdate = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId && !refs.equal(dep.ref, test.ref);
};

const isConfigure = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId && refs.equal(dep.ref, test.ref);
};

// This is called by prepare and also prepareDynamicExtensions
async function prepareHelper(
  context: Context,
  options: DeployOptions,
  payload: Payload,
  wantExtensions: planner.DeploymentInstanceSpec[],
  haveExtensions: planner.DeploymentInstanceSpec[],
  isDynamic: boolean,
): Promise<void> {
  const projectId = needProjectId(options);

  context.want = wantExtensions;
  context.have = haveExtensions;

  const etagsChanged = detectEtagChanges(options.rc, projectId, context.have);
  if (etagsChanged.length) {
    // We only care about changed eTags for things we are going to deploy
    const wantChangedIds = wantExtensions
      .map((e) => e.instanceId)
      .filter((id) => etagsChanged.includes(id));
    if (wantChangedIds.length) {
      outOfBandChangesWarning(wantChangedIds, isDynamic);
      if (
        !(await prompt.confirm({
          message: `Do you wish to continue deploying these extension instances?`,
          default: false,
          nonInteractive: options.nonInteractive,
          force: options.force,
        }))
      ) {
        throw new FirebaseError("Deployment cancelled");
      }
    }
  }

  // Check if any extension instance that we want is using secrets,
  // and ensure the API is enabled if so.
  const usingSecrets = await Promise.all(context.want?.map(checkSpecForSecrets));
  if (usingSecrets.some((i) => i)) {
    await ensureSecretManagerApiEnabled(options);
  }

  const usingV2Functions = await Promise.all(context.want?.map(checkSpecForV2Functions));
  if (usingV2Functions) {
    await ensureNecessaryV2ApisAndRoles(options);
  }

  payload.instancesToCreate = context.want.filter((i) => !context.have?.some(matchesInstanceId(i)));
  payload.instancesToConfigure = context.want.filter((i) => context.have?.some(isConfigure(i)));
  payload.instancesToUpdate = context.want.filter((i) => context.have?.some(isUpdate(i)));
  payload.instancesToDelete = context.have.filter((i) => !context.want?.some(matchesInstanceId(i)));

  if (await displayWarningsForDeploy(payload.instancesToCreate)) {
    if (
      !(await prompt.confirm({
        message: `Do you wish to continue deploying these extension instances?`,
        default: true,
        nonInteractive: options.nonInteractive,
        force: options.force,
      }))
    ) {
      throw new FirebaseError("Deployment cancelled");
    }
  }

  const permissionsNeeded: string[] = [];

  if (payload.instancesToCreate.length) {
    permissionsNeeded.push("firebaseextensions.instances.create");
    logger.info(deploymentSummary.createsSummary(payload.instancesToCreate));
  }
  if (payload.instancesToUpdate.length) {
    permissionsNeeded.push("firebaseextensions.instances.update");
    logger.info(deploymentSummary.updatesSummary(payload.instancesToUpdate, context.have));
  }
  if (payload.instancesToConfigure.length) {
    permissionsNeeded.push("firebaseextensions.instances.update");
    logger.info(deploymentSummary.configuresSummary(payload.instancesToConfigure));
  }
  if (payload.instancesToDelete.length) {
    logger.info(deploymentSummary.deletesSummary(payload.instancesToDelete, isDynamic));
    if (options.dryRun) {
      logger.info("On your next deploy, you will be asked if you want to delete these instances.");
      logger.info("If you deploy --force, they will be deleted.");
    }
    if (
      !options.dryRun &&
      !(await prompt.confirm({
        message: `Would you like to delete ${payload.instancesToDelete
          .map((i) => i.instanceId)
          .join(", ")}?`,
        default: false,
        nonInteractive: options.nonInteractive,
        force: options.force,
      }))
    ) {
      payload.instancesToDelete = [];
    } else {
      permissionsNeeded.push("firebaseextensions.instances.delete");
    }
  }

  await requirePermissions(options, permissionsNeeded);
  if (options.dryRun) {
    const appDevTos = await getAppDeveloperTOSStatus(projectId);
    if (!appDevTos.lastAcceptedVersion) {
      logger.info(
        "On your next deploy, you will be asked to accept the Firebase Extensions App Developer Terms of Service",
      );
    }
  } else {
    await acceptLatestAppDeveloperTOS(
      options,
      projectId,
      context.want.map((i) => i.instanceId),
    );
  }
}

/**
 * This is called by functions/prepare so we can deploy the extensions defined by SDKs
 * @param context The prepare context
 * @param options The prepare options
 * @param payload The prepare payload
 * @param builds firebase functions builds
 */
export async function prepareDynamicExtensions(
  context: Context,
  options: DeployOptions,
  payload: Payload,
  builds: Record<string, Build>,
): Promise<void> {
  const filters = getEndpointFilters(options);
  const extensions = extractExtensionsFromBuilds(builds, filters);
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  let haveExtensions = await planner.haveDynamic(projectId);
  haveExtensions = haveExtensions.filter((e) =>
    extensionMatchesAnyFilter(e.labels?.codebase, e.instanceId, filters),
  );

  if (Object.keys(extensions).length === 0 && haveExtensions.length === 0) {
    // Nothing defined, and nothing to delete
    return;
  }

  const dynamicWant = await planner.wantDynamic({
    projectId,
    projectNumber,
    extensions,
  });

  return prepareHelper(
    context,
    options,
    payload,
    dynamicWant,
    haveExtensions,
    true /* isDynamic */,
  );
}

/**
 * static Extensions prepare (not to be confused with dynamic extensions)
 * @param context The prepare context
 * @param options The prepare options
 * @param payload The prepare payload
 */
export async function prepare(
  context: Context,
  options: DeployOptions,
  payload: Payload,
): Promise<void> {
  context.extensionsStartTime = Date.now();
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  const aliases = getAliases(options, projectId);
  const projectDir = options.config.projectDir;

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  const wantExtensions = await planner.want({
    projectId,
    projectNumber,
    aliases,
    projectDir,
    extensions: options.config.get("extensions", {}) as Record<string, string>,
  });

  const haveExtensions = await planner.have(projectId);

  return prepareHelper(
    context,
    options,
    payload,
    wantExtensions,
    haveExtensions,
    false /* isDynamic */,
  );
}
