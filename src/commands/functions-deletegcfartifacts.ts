import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import {
  listGcfPaths,
  deleteGcfArtifacts,
  DockerHelper,
} from "../deploy/functions/containerCleaner";
import { confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { FirebaseError } from "../error";
import { RC } from "../rc";

function getConfirmationMessage(paths: string[]): string {
  let message = "You are about to delete all images in the following directories:\n\n";
  for (const path of paths) {
    message += `${path}\n`;
  }
  message += "\nAre you sure?\n";
  return message;
}

export const command = new Command("functions:deletegcfartifacts")
  .description(
    "deletes all artifacts created by Google Cloud Functions on Google Container Registry",
  )
  .option(
    "--regions <regions>",
    "Specify regions of artifacts to be deleted. " +
      "If omitted, artifacts from all regions will be deleted. " +
      "<regions> is a Google defined region list, e.g. us-central1,us-east1,europe-west2.",
  )
  .before(requirePermissions, ["storage.objects.delete"])
  .action(
    async (options: {
      project?: string;
      projectId?: string;
      rc: RC;
      regions?: string;
      force?: boolean;
      nonInteractive?: boolean;
    }) => {
      const projectId = needProjectId(options);
      const regions = options.regions ? options.regions.split(",") : undefined;
      const dockerHelper: Record<string, DockerHelper> = {}; // cache dockerhelpers
      try {
        const gcfPaths = await listGcfPaths(projectId, regions, dockerHelper);
        const confirmDeletion = await confirm({
          default: false,
          message: getConfirmationMessage(gcfPaths),
          force: options.force,
          nonInteractive: options.nonInteractive,
        });
        if (!confirmDeletion) {
          throw new FirebaseError("Command aborted.", { exit: 1 });
        }
        await deleteGcfArtifacts(projectId, regions, dockerHelper);
      } catch (err: any) {
        throw new FirebaseError("Command failed.", { original: err });
      }
    },
  );
