import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { FirebaseError, getError } from "../error";
import { promptOnce } from "../prompt";
import * as utils from "../utils";
import * as apphosting from "../gcp/apphosting";
import { printBackendsTable } from "./apphosting-backends-list";
import {
  deleteBackendAndPoll,
  getBackendForAmbiguousLocation,
  getBackendForLocation,
  chooseBackend,
} from "../apphosting/backend";
import * as ora from "ora";

export const command = new Command("apphosting:backends:delete <backend>")
  .description("delete a Firebase App Hosting backend")
  .withForce()
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    let location = options.location as string;
    let backend: apphosting.Backend;

    backend = await chooseBackend(
      projectId,
      backendId,
      "Please select the backend you'd like to delete:",
      options.force,
    );

    utils.logWarning("You are about to permanently delete this backend:");
    printBackendsTable([backend]);

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

    const spinner = ora("Deleting backend...").start();
    try {
      await deleteBackendAndPoll(projectId, location, backendId);
      spinner.succeed(`Successfully deleted the backend: ${backendId}`);
    } catch (err: unknown) {
      spinner.stop();
      throw new FirebaseError(`Failed to delete backend: ${backendId}.`, {
        original: getError(err),
      });
    }
  });
