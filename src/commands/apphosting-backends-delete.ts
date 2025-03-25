import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError, getError } from "../error";
import { promptOnce } from "../prompt";
import * as utils from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";
import { deleteBackendAndPoll, chooseBackends } from "../apphosting/backend";
import * as ora from "ora";

export const command = new Command("apphosting:backends:delete <backend>")
  .description("delete a Firebase App Hosting backend")
  .withForce()
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);

    const backends = await chooseBackends(
      projectId,
      backendId,
      "Please select the backends you'd like to delete:",
      options.force,
    );

    utils.logWarning("You are about to permanently delete these backend(s):");
    printBackendsTable(backends);

    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: "Are you sure?",
      },
      options,
    );
    if (!confirmDeletion) {
      return;
    }

    for (const b of backends) {
      const { location, id } = apphosting.parseBackendName(b.name);
      const spinner = ora(`Deleting backend ${id}(${location})...`).start();
      try {
        await deleteBackendAndPoll(projectId, location, id);
        spinner.succeed(`Successfully deleted the backend: ${id}(${location})`);
      } catch (err: unknown) {
        spinner.stop();
        throw new FirebaseError(`Failed to delete backend: ${id}(${location}). Please retry.`, {
          original: getError(err),
        });
      }
    }
  });
