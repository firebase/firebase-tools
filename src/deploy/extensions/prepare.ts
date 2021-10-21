import * as planner from "./planner";
import * as deploymentSummary from "./deploymentSummary";
import * as prompt from "../../prompt";
import * as refs from "../../extensions/refs";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logger } from "../../logger";
import { Payload } from "./args";
import { FirebaseError } from "../../error";
import { requirePermissions } from "../../requirePermissions";
import { ensureExtensionsApiEnabled } from "../../extensions/extensionsHelper";
import { ensureSecretManagerApiEnabled, usesSecrets } from "../../extensions/secretsUtils";
import { checkSpecForSecrets, handleSecretParams } from "./secrets";

export async function prepare(
  context: any, // TODO: type this
  options: Options,
  payload: Payload
) {
  const projectId = needProjectId(options);

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  const have = await planner.have(projectId);
  const want = await planner.want(
    projectId,
    options.config.projectDir,
    options.config.get("extensions")
  );

  // Check if any extension instance that we want is using secrets,
  // and ensure the API is enabled if so.
  const usingSecrets = await Promise.all(want.map(checkSpecForSecrets));
  if (usingSecrets.some((i) => i)) {
    await ensureSecretManagerApiEnabled(options);
  }

  payload.instancesToCreate = want.filter((i) => !have.some(matchesInstanceId(i)));
  payload.instancesToConfigure = want.filter((i) => have.some(isConfigure(i)));
  payload.instancesToUpdate = want.filter((i) => have.some(isUpdate(i)));
  payload.instancesToDelete = have.filter((i) => !want.some(matchesInstanceId(i)));

  const permissionsNeeded: string[] = [];

  if (payload.instancesToCreate.length) {
    permissionsNeeded.push("firebaseextensions.instances.create");
    logger.info(deploymentSummary.createsSummary(payload.instancesToCreate));
  }
  if (payload.instancesToUpdate.length) {
    permissionsNeeded.push("firebaseextensions.instances.update");
    logger.info(deploymentSummary.updatesSummary(payload.instancesToUpdate, have));
  }
  if (payload.instancesToConfigure.length) {
    permissionsNeeded.push("firebaseextensions.instances.update");
    logger.info(deploymentSummary.configuresSummary(payload.instancesToConfigure));
  }
  if (payload.instancesToDelete.length) {
    logger.info(deploymentSummary.deletesSummary(payload.instancesToDelete));
    if (!options.force && options.nonInteractive) {
      throw new FirebaseError("Pass the --force flag to use this command in non-interactive mode");
    } else if (
      !options.force &&
      !options.nonInteractive &&
      !(await prompt.promptOnce({
        type: "confirm",
        message: `Would you like to delete ${payload.instancesToDelete
          .map((i) => i.instanceId)
          .join(", ")}?`,
        default: false,
      }))
    ) {
      payload.instancesToDelete = [];
    } else {
      permissionsNeeded.push("firebaseextensions.instances.delete");
    }
  }

  await requirePermissions(options, permissionsNeeded);

  // Check if the secrets used exist, and prompt to create them if not.
  await handleSecretParams(payload, have, options.nonInteractive);
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
