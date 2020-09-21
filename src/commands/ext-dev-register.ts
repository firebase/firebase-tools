import * as clc from "cli-color";

import { Command } from "../command";
import { registerPublisherProfile } from "../extensions/extensionsApi";
import * as getProjectId from "../getProjectId";
import { promptOnce } from "../prompt";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { promptForPublisherTOS } from "../extensions/askUserForConsent";
import { requirePermissions } from "../requirePermissions";
import { FirebaseError } from "../error";
import * as utils from "../utils";

/**
 * Register a publisher ID; run this before publishing any extensions.
 */
export default new Command("ext:dev:register")
  .description("register a publisher ID; run this before publishing your first extension.")
  // temporary until registry-specific permissions are available
  .before(requirePermissions, ["firebaseextensions.sources.create"])
  .before(ensureExtensionsApiEnabled)
  .action(async (options: any) => {
    const projectId = getProjectId(options, false);
    const msg =
      "What would you like to register as your publisher ID?" +
      " This value identifies you to Extensions Registry users as the author of your extensions." +
      " Examples: my-company-name, MyGitHubUsername\n\n" +
      "You can only do this once for each project.";
    const publisherId = await promptOnce({
      name: "publisherId",
      type: "input",
      message: msg,
      default: projectId,
    });
    await promptForPublisherTOS();
    try {
      await registerPublisherProfile(projectId, publisherId);
    } catch (err) {
      if (err.status === 409) {
        const error =
          `Couldn't register the publisher ID ${clc.bold(publisherId)} to the project ${clc.bold(
            projectId
          )}.` +
          " This can happen for either of two reasons:\n\n" +
          ` - ${clc.bold(publisherId)} is registered to another project\n` +
          ` - ${clc.bold(projectId)} already has a publisher ID\n\n` +
          " Try again with a unique publisher ID or a new project.";
        throw new FirebaseError(error, { exit: 1 });
      }
      throw new FirebaseError(
        `Failed to register publisher ID ${clc.bold(publisherId)} for project ${clc.bold(
          projectId
        )}: ${err.message}`,
        { exit: 1 }
      );
    }
    return utils.logLabeledBullet(
      logPrefix,
      `Publisher ID ${clc.bold(publisherId)} has been registered to project ${clc.bold(projectId)}.`
    );
  });
