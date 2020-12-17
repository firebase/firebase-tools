import * as clc from "cli-color";
import * as marked from "marked";

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
    await promptForPublisherTOS();
    const projectId = getProjectId(options, false);
    const msg =
      "What would you like to register as your publisher ID? " +
      "This value identifies you in Firebase's registry of extensions as the author of your extensions. " +
      "Examples: my-company-name, MyGitHubUsername. If you are a member of the Extensions EAP group, your published extensions will only be accessible to other members of the EAP group. \n\n" +
      "You can only do this once for each project.";
    const publisherId = await promptOnce({
      name: "publisherId",
      type: "input",
      message: msg,
      default: projectId,
    });
    try {
      await registerPublisherProfile(projectId, publisherId);
    } catch (err) {
      if (err.status === 409) {
        const error =
          `Couldn't register the publisher ID '${clc.bold(publisherId)}' to the project '${clc.bold(
            projectId
          )}'.` +
          " This can happen for either of two reasons:\n\n" +
          ` - Publisher ID '${clc.bold(publisherId)}' is registered to another project\n` +
          ` - Project '${clc.bold(projectId)}' already has a publisher ID\n\n` +
          ` Try again with a unique publisher ID or a new project. If your business’s name has been registered to another project, contact Firebase support ${marked(
            "(https://firebase.google.com/support/troubleshooter/contact)."
          )}`;
        throw new FirebaseError(error, { exit: 1 });
      }
      throw new FirebaseError(
        `Failed to register publisher ID ${clc.bold(publisherId)} for project ${clc.bold(
          projectId
        )}: ${err.message}`,
        { exit: 1 }
      );
    }
    return utils.logLabeledSuccess(
      logPrefix,
      `Publisher ID '${clc.bold(publisherId)}' has been registered to project ${clc.bold(
        projectId
      )}`
    );
  });
