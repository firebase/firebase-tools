import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("ailogic:templates:get <templateId>")
  .description("print one template")
  .before(requirePermissions, ["firebasevertexai.templates.get"])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
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
