import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";
import { FirebaseError, getErrStatus } from "../error";

import { Options } from "../options";

export const command = new Command("ailogic:templates:unlock <templateId>")
  .description("unlock a template")
  .before(requirePermissions, ["firebasevertexai.templates.update"])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    try {
      await ailogic.unlockTemplate(projectId, ailogic.GLOBAL_LOCATION, templateId);
    } catch (err: unknown) {
      if (getErrStatus(err) === 404) {
        throw new FirebaseError(`Template ${clc.bold(templateId)} does not exist.`);
      }
      throw err;
    }
    utils.logSuccess(`Unlocked template: ${clc.bold(templateId)}`);
  });
