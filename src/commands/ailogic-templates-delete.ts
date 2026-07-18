import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";
import { confirm } from "../prompt";
import { FirebaseError, getErrStatus } from "../error";

import { Options } from "../options";

export const command = new Command("ailogic:templates:delete <templateId>")
  .description("delete a template")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["firebasevertexai.templates.delete"])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    let template: ailogic.Template;
    try {
      template = await ailogic.getTemplate(projectId, ailogic.GLOBAL_LOCATION, templateId);
    } catch (err: unknown) {
      if (getErrStatus(err) === 404) {
        throw new FirebaseError(`Template ${clc.bold(templateId)} does not exist.`);
      }
      throw err;
    }

    // A locked template cannot be deleted; --force does not override a lock.
    if (template.locked) {
      throw new FirebaseError(
        `The following templates are locked and cannot be deleted:\n\n  ${templateId}\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>`,
      );
    }

    // confirm() aborts in non-interactive mode unless --force is set.
    const confirmed = await confirm({
      message: `Are you sure you want to delete template ${clc.bold(templateId)}?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    await ailogic.deleteTemplate(projectId, ailogic.GLOBAL_LOCATION, templateId);
    utils.logSuccess(`Deleted template: ${clc.bold(templateId)}`);
  });
