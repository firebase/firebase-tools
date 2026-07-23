import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";

import { Options } from "../options";

export const command = new Command("ailogic:templates:lock <templateId>")
  .description("lock a template")
  .before(requirePermissions, ["firebasevertexai.templates.update"])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    const template = await ailogic.withTemplate404(templateId, () =>
      ailogic.setTemplateLocked(projectId, templateId, true),
    );
    utils.logSuccess(`Locked template: ${clc.bold(templateId)}`);
    return template;
  });
