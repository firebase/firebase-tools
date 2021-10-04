import * as planner from "./planner";
import * as deploymentSummary from "./deploymentSummary";
import * as prompt from "../../prompt";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logger } from "../../logger";
import { Payload } from "./args";
import { FirebaseError } from "../../error";
import { requirePermissions } from "../../requirePermissions";
import { ensureExtensionsApiEnabled } from "../../extensions/extensionsHelper";

export async function prepare(
  context: any, // TODO: type this
  options: Options,
  payload: Payload
) {
  const projectId = needProjectId(options);

  await ensureExtensionsApiEnabled(options);
  await requirePermissions(options, ["firebaseextensions.instances.list"]);

  const have = await planner.have(projectId);
  const want = await planner.want(options.config.get("extensions"), options.config.projectDir);

  payload.instancesToCreate = want.filter((dep) => !have.some(matchesInstanceId(dep)));
  payload.instancesToUpdate = want.filter((dep) => have.some(matchesInstanceId(dep)));
  payload.instancesToDelete = have.filter((dep) => !want.some(matchesInstanceId(dep)));

  const permissionsNeeded: string[] = [];

  if (payload.instancesToCreate.length) {
    permissionsNeeded.push("firebaseextensions.instances.create");
    logger.info(deploymentSummary.createsSummary(payload.instancesToCreate));
  }
  if (payload.instancesToUpdate.length) {
    permissionsNeeded.push("firebaseextensions.instances.update");
    logger.info(deploymentSummary.updatesSummary(payload.instancesToUpdate, have));
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
        message: "Would you like to delete these extension instances?",
        default: false,
      }))
    ) {
      payload.instancesToDelete = [];
    } else {
      permissionsNeeded.push("firebaseextensions.instances.delete");
    }
  }

  await requirePermissions(options, permissionsNeeded);
}

const matchesInstanceId = (dep: { instanceId: string }) => (test: { instanceId: string }) => {
  return dep.instanceId === test.instanceId;
};
