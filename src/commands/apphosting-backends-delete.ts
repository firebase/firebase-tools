import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { FirebaseError, getError } from "../error.js";
import { promptOnce } from "../prompt.js";
import * as utils from "../utils.js";
import * as apphosting from "../gcp/apphosting.js";
import { printBackendsTable } from "./apphosting-backends-list.js";
import {
  deleteBackendAndPoll,
  getBackendForAmbiguousLocation,
  getBackendForLocation,
} from "../apphosting/backend.js";
import ora from "ora";

export const command = new Command("apphosting:backends:delete <backend>")
  .description("delete a Firebase App Hosting backend")
  .option("-l, --location <location>", "specify the location of the backend", "-")
  .withForce()
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, options: Options) => {
    const projectId = needProjectId(options);
    let location = options.location as string;
    let backend: apphosting.Backend;
    if (location === "-" || location === "") {
      backend = await getBackendForAmbiguousLocation(
        projectId,
        backendId,
        "Please select the location of the backend you'd like to delete:",
      );
      location = apphosting.parseBackendName(backend.name).location;
    } else {
      backend = await getBackendForLocation(projectId, location, backendId);
    }

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
