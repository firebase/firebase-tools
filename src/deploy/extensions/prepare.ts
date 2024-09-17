import * as planner from "./planner";
import * as deploymentSummary from "./deploymentSummary";
import * as prompt from "../../prompt";
import * as refs from "../../extensions/refs";
import { Options } from "../../options";
import { getAliases, needProjectId, needProjectNumber } from "../../projectUtils";
import { logger } from "../../logger";
import { Context, Payload } from "./args";
import { FirebaseError } from "../../error";
import { requirePermissions } from "../../requirePermissions";
import {
  checkExtensionsApiEnabled,
  ensureExtensionsApiEnabled,
} from "../../extensions/extensionsHelper";
import { ensureSecretManagerApiEnabled } from "../../extensions/secretsUtils";
import { checkSpecForSecrets } from "./secrets";
import { displayWarningsForDeploy, outOfBandChangesWarning } from "../../extensions/warnings";
import { detectEtagChanges } from "../../extensions/etags";
import { checkSpecForV2Functions, ensureNecessaryV2ApisAndRoles } from "./v2FunctionHelper";
import { acceptLatestAppDeveloperTOS } from "../../extensions/tos";
import {
  extractAllDynamicExtensions,
  extractExtensionsFromBuilds,
} from "../../extensions/runtimes/common";
import { Build } from "../functions/build";
import { normalizeAndValidate } from "../../functions/projectConfig";
import { getEndpointFilters, targetCodebases } from "../functions/functionsDeployHelper";

// This is called by prepare and also prepareDynamicExtensions. The only difference
// is which set of extensions is in the want list and which is in the noDelete list.
// isPrimaryCall is true exactly once per deploy. So if you have just 'firebase deploy'
// it will be true when called from extensions/prepare but false when called from
// functions/prepare. If you have 'firebase deploy --only functions' then it will
// be true when called from functions/prepare (since extensions/prepare would
// not be called). It is necessary otherwise you can get the same questions
// and notifications twice (e.g. delete these extensions?)
async function prepareHelper(
  context: Context,
  options: Options,
  payload: Payload,
  wantExtensions: planner.DeploymentInstanceSpec[],
  noDeleteExtensions: planner.DeploymentInstanceSpec[],
  isPrimaryCall: boolean,
) {
  const projectId = needProjectId(options);

  context.have = await planner.have(projectId);
  context.want = wantExtensions;

  const etagsChanged = detectEtagChanges(options.rc, projectId, context.have);
  if (etagsChanged.length) {
    // We only care about changed eTags for things we are going to deploy
    const wantChangedIds = wantExtensions
      .map((e) => e.instanceId)
      .filter((id) => etagsChanged.includes(id));
    if (wantChangedIds.length) {
      outOfBandChangesWarning(wantChangedIds);
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
  payload.instancesToDelete = context.have.filter(
    (i) =>
      !context.want?.some(matchesInstanceId(i)) && !noDeleteExtensions?.some(matchesInstanceId(i)),
  );

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
  if (!isPrimaryCall) {
    // Don't ask to delete the same extensions again
    payload.instancesToDelete = [];
  }

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
    logger.info(deploymentSummary.deletesSummary(payload.instancesToDelete));
    if (
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
  await acceptLatestAppDeveloperTOS(
    options,
    projectId,
    context.want.map((i) => i.instanceId),
  );
}

// This is called by functions/prepare so we can deploy the extensions defined by SDKs
export async function prepareDynamicExtensions(
  context: Context,
  options: Options,
  payload: Payload,
  builds: Record<string, Build>,
) {
  const filters = getEndpointFilters(options);
  const extensions = extractExtensionsFromBuilds(builds, filters);
  const isApiEnabled = await checkExtensionsApiEnabled(options);
  if (Object.keys(extensions).length === 0 && !isApiEnabled) {
    // Assume if we have no extensions defined and the API is not enabled
    // there is nothing to delete.
    return;
  }
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  const aliases = getAliases(options, projectId);
  const projectDir = options.config.projectDir;

  // This is only a primary call if we are not including extensions
  const isPrimaryCall = !!options.only && !options.only.split(",").includes("extensions");

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  const dynamicWant = await planner.wantDynamic({
    projectId,
    projectNumber,
    extensions,
  });

  // Secondary calls do not need to calculate which extensions
  // should not be deleted since we skip deletes for secondary
  // calls. (We have already asked about them in the primary call).
  let noDeleteExtensions: planner.DeploymentInstanceSpec[] = [];
  if (isPrimaryCall) {
    // Don't delete these extensions defined in firebase.json
    const firebaseJsonWant = await planner.want({
      projectId,
      projectNumber,
      aliases,
      projectDir,
      extensions: options.config.get("extensions", {}),
    });
    noDeleteExtensions = noDeleteExtensions.concat(firebaseJsonWant);
    if (hasNonDeployingCodebases(options)) {
      // Don't delete these (e.g. if we are only deploying codebase A and there are
      // extensions in codebase B too, we don't want to delete them).
      const dynamicAll = await planner.wantDynamic({
        projectId,
        projectNumber,
        extensions: await extractAllDynamicExtensions(options),
      });
      noDeleteExtensions = noDeleteExtensions.concat(dynamicAll);
    }
  }

  // We are in prepareDynamicExtensions because it is called from functions prepare
  // Check if we are also deploying extensions (either no `--only` or including
  // `--only extensions`) if so, it's not a primary call
  return prepareHelper(context, options, payload, dynamicWant, noDeleteExtensions, isPrimaryCall);
}

// Are there codebases that are not included in the current deploy?
function hasNonDeployingCodebases(options: Options) {
  const functionFilters = getEndpointFilters(options);
  if (functionFilters?.length) {
    // If we are filtering for just one extension or function or codebase,
    // Then we have non-deploying code.
    return true;
  }

  const functionsConfig = normalizeAndValidate(options.config.src.functions);
  const allCodebases = targetCodebases(functionsConfig);
  const deployingCodebases = targetCodebases(functionsConfig, functionFilters);

  if (allCodebases.length > deployingCodebases.length) {
    return true;
  }
}

export async function prepare(context: Context, options: Options, payload: Payload) {
  context.extensionsStartTime = Date.now();
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  const aliases = getAliases(options, projectId);
  const projectDir = options.config.projectDir;

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  const firebaseJsonWant = await planner.want({
    projectId,
    projectNumber,
    aliases,
    projectDir,
    extensions: options.config.get("extensions", {}),
  });
  const dynamicWant = await planner.wantDynamic({
    projectId,
    projectNumber,
    extensions: await extractAllDynamicExtensions(options),
  });

  return prepareHelper(context, options, payload, firebaseJsonWant, dynamicWant, true);
}

const matchesInstanceId = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId;
};

const isUpdate = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId && !refs.equal(dep.ref, test.ref);
};

const isConfigure = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId && refs.equal(dep.ref, test.ref);
};
