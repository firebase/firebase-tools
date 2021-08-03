import { Command } from "../command";
import * as utils from "../utils";
import * as getProjectId from "../getProjectId";
import { listGCFArtifacts, deleteGCFArtifacts } from "../deploy/functions/containerCleaner";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";

function getConfirmationMessage(artifacts: Set<string>): string {
  let message = "You are about to delete the following images from the gcf/ directory: \n";
  for (const artifact of artifacts) {
    message += `${artifact}\n`;
  }
  message += "Are you sure?\n";
  return message;
}

export default new Command("functions:deletegcfartifacts")
  .description("Deletes all artifacts created by Google Cloud Functions on Google Cloud Registry.")
  .option(
    "--regions <regions>",
    "Specify regions of artifacts to be deleted. " +
      "If omitted, artifacts from all regions will be deleted. " +
      "<regions> is a Google defined region list, e.g. us-central1,us-east1,europe-west2."
  )
  .before(requirePermissions, ["storage.objects.delete"])
  .action(async (options: { regions?: string }) => {
    const projectId = getProjectId(options);
    const regions = options.regions ? options.regions.split(",") : undefined;
    try {
      const gcfArtifacts = await listGCFArtifacts(projectId, regions);
      const confirmDeletion = await promptOnce(
        {
          type: "confirm",
          name: "force",
          default: false,
          message: getConfirmationMessage(gcfArtifacts),
        },
        options
      );
      if (!confirmDeletion) {
        return utils.reject("Command aborted.", { exit: 1 });
      }
      await deleteGCFArtifacts(projectId, regions);
    } catch (err) {
      utils.reject(err);
    }
  });
