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
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    const template = await ailogic.getTemplate(projectId, "global", templateId);
    logger.info(template.templateString);
    return template;
  });
