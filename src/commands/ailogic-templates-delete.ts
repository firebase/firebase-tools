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
  .help(
    `deletes one deployed server prompt template after confirmation (skippable with --force).

<templateId> is the template's id, as shown in \`ailogic:templates:list\`. A locked template cannot be deleted; unlock it first with \`ailogic:templates:unlock\` (--force does not override a lock).

For example:

  \`firebase ailogic:templates:delete my-template --force\``,
  )
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, [
    "firebasevertexai.templates.delete",
    // ensureAILogicApiEnabled reads API enablement state via Service Usage.
    "serviceusage.services.get",
  ])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
    // Validate the id up front so bad input fails fast, before the API-enablement flow.
    ailogic.assertValidTemplateId(templateId);

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    const template = await ailogic.withTemplate404(templateId, () =>
      ailogic.getTemplate(projectId, templateId),
    );

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

    // Pass the etag from the pre-confirmation read so the server refuses (409) to
    // delete a template that changed while the prompt was on screen; a 404 (deleted
    // out from under us) still maps to the friendly "does not exist" error.
    try {
      await ailogic.withTemplate404(templateId, () =>
        ailogic.deleteTemplate(projectId, templateId, template.etag),
      );
    } catch (err: unknown) {
      if (getErrStatus(err) === 409) {
        throw new FirebaseError(
          `Template ${clc.bold(templateId)} was modified while awaiting confirmation. Re-run the command to delete its latest version.`,
        );
      }
      throw err;
    }
    utils.logSuccess(`Deleted template: ${clc.bold(templateId)}`);
    return template;
  });
