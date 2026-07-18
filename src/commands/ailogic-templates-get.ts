import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import { FirebaseError, getErrStatus } from "../error";

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
    let template: ailogic.Template;
    try {
      template = await ailogic.getTemplate(projectId, ailogic.GLOBAL_LOCATION, templateId);
    } catch (err: unknown) {
      if (getErrStatus(err) === 404) {
        throw new FirebaseError(`Template ${clc.bold(templateId)} does not exist.`);
      }
      throw err;
    }
    logger.info(template.templateString);
    return template;
  });
