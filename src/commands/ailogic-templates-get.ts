import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import { PROMPT_FILE_EXT } from "../ailogic/templates";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("ailogic:templates:get <templateId>")
  .description("print one template")
  .help(
    `prints the full content of one deployed server prompt template.

<templateId> is the template's id, as shown in the first column of \`ailogic:templates:list\` (for templates deployed from files, the file path without the ${PROMPT_FILE_EXT} extension, with '/' as '.').

For example:

  \`firebase ailogic:templates:get my-template\``,
  )
  .before(requirePermissions, [
    "firebasevertexai.templates.get",
    // isAILogicApiEnabled reads API enablement state via Service Usage.
    "serviceusage.services.get",
  ])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
    // Validate the id up front so bad input fails fast, before any API calls.
    ailogic.assertValidTemplateId(templateId);
    if (!(await ailogic.isAILogicApiEnabled(projectId))) {
      logger.info("Firebase AI Logic is not enabled on this project.");
      return;
    }
    const template = await ailogic.withTemplate404(templateId, () =>
      ailogic.getTemplate(projectId, templateId),
    );
    logger.info(template.templateString);
    return template;
  });
