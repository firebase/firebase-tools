import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";

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
      template = await ailogic.getTemplate(projectId, "global", templateId);
    } catch (err: any) {
      if (err.status === 404) {
        throw new FirebaseError(`Template ${clc.bold(templateId)} does not exist.`);
      }
      throw err;
    }

    if (template.locked) {
      throw new FirebaseError(
        `The following templates are locked and cannot be deleted:\n\n  ${templateId}\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>`,
      );
    }

    const confirmed = await confirm({
      message: `Are you sure you want to delete template ${clc.bold(templateId)}?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    await ailogic.deleteTemplate(projectId, "global", templateId);
    logger.info(clc.green(`Successfully deleted template: ${clc.bold(templateId)}`));
  });
