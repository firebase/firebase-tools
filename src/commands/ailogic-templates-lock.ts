import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("ailogic:templates:lock <templateId>")
  .description("lock a template")
  .before(requirePermissions, ["firebasevertexai.templates.update"])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    await ailogic.lockTemplate(projectId, "global", templateId);
    logger.info(clc.green(`Successfully locked template: ${clc.bold(templateId)}`));
  });
