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
import { ensureExtensionsApiEnabled } from "../../extensions/extensionsHelper";
import { ensureSecretManagerApiEnabled } from "../../extensions/secretsUtils";
import { checkSpecForSecrets } from "./secrets";
import { displayWarningsForDeploy, outOfBandChangesWarning } from "../../extensions/warnings";
import { detectEtagChanges } from "../../extensions/etags";
import { checkSpecForV2Functions, ensureNecessaryV2ApisAndRoles } from "./v2FunctionHelper";
import { acceptLatestAppDeveloperTOS } from "../../extensions/tos";

export async function prepare(context: Context, options: Options, payload: Payload) {
  context.extensionsStartTime = Date.now();
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  const aliases = getAliases(options, projectId);

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  context.have = await planner.have(projectId);
  context.want = await planner.want({
    projectId,
    projectNumber,
    aliases,
    projectDir: options.config.projectDir,
    extensions: options.config.get("extensions"),
  });

  const etagsChanged = detectEtagChanges(options.rc, projectId, context.have);
  if (etagsChanged.length) {
    outOfBandChangesWarning(etagsChanged);
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
const matchesInstanceId = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId;
};

const isUpdate = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId && !refs.equal(dep.ref, test.ref);
};

const isConfigure = (dep: planner.InstanceSpec) => (test: planner.InstanceSpec) => {
  return dep.instanceId === test.instanceId && refs.equal(dep.ref, test.ref);
};
