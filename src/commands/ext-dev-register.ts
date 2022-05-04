import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");

import { Command } from "../command";
import { registerPublisherProfile } from "../extensions/extensionsApi";
import { needProjectId } from "../projectUtils";
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
    const projectId = needProjectId(options);
    const msg =
      "What would you like to register as your publisher ID? " +
      "This value identifies you in Firebase's registry of extensions as the author of your extensions. " +
      "Examples: my-company-name, MyGitHubUsername.\n\n" +
      "You can only do this once for each project.";
    const publisherId = await promptOnce({
      name: "publisherId",
      type: "input",
      message: msg,
      default: projectId,
    });
    const msg2 =
      "What is the URI of your public facing website where users can learn more about you?";
    const websiteUri = await promptOnce({
      name: "publisherId",
      type: "input",
      message: msg2,
    });
    const msg3 = "What display name would you like to use for your publisher profile?";
    const displayName = await promptOnce({
      name: "publisherId",
      type: "input",
      message: msg3,
    });
    try {
      await registerPublisherProfile(projectId, publisherId, websiteUri, displayName);
    } catch (err: any) {
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
        )}: ${err.message}`
      );
    }
    return utils.logLabeledSuccess(
      logPrefix,
      `Publisher ID '${clc.bold(publisherId)}' has been registered to project ${clc.bold(
        projectId
      )}`
    );
  });
