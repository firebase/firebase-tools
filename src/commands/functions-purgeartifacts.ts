import { Command } from "../command";
import * as utils from "../utils";
import * as getProjectId from "../getProjectId";
import { purgeArtifacts } from "../deploy/functions/containerCleaner";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";

function getConfirmationMessage(options: { force: boolean; region?: string }) {
  if (options.region) {
    return "You are about to purge the region: " + options.region + ". Are you sure?";
  }
  return "You are about to purge all regions. Are you sure?";
}

export default new Command("functions:purgeartifacts")
  .description("Purges all artifacts created by Google Cloud Functions.")
  .option(
    "--region <region>",
    "Specify region of the function to be purged. " +
      "If omitted, functions from all regions will be purged. "
  )
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, ["storage.objects.delete"])
  .action(async (options: { force: boolean; region?: string }) => {
    const projectId = getProjectId(options);

    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: getConfirmationMessage(options),
      },
      options
    );
    if (!confirmDeletion) {
      return utils.reject("Command aborted.", { exit: 1 });
    }

    try {
      await purgeArtifacts(projectId, options.region);
    } catch (err) {
      utils.reject(err);
    }
  });
