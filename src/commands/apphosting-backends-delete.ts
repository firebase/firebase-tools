import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { FirebaseError, getError } from "../error";
import { confirm } from "../prompt";
import * as utils from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";
import { deleteBackendAndPoll, chooseBackends } from "../apphosting/backend";
import ora from "ora";

export const command = new Command("apphosting:backends:delete <backend>")
  .description("delete a Firebase App Hosting backend")
  .withForce()
  .before(requireAuth)
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

    const confirmDeletion = await confirm({
      message: "Are you sure?",
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
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
