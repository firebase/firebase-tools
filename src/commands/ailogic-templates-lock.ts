import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";

import { Options } from "../options";

export const command = new Command("ailogic:templates:lock <templateId>")
  .description("lock a template")
  .help(
    `locks one deployed server prompt template. A locked template cannot be updated or deleted (including by \`firebase deploy\`) until it is unlocked with \`ailogic:templates:unlock\`.

<templateId> is the template's id, as shown in \`ailogic:templates:list\`.

For example:

  \`firebase ailogic:templates:lock my-template\``,
  )
  .before(requirePermissions, [
    "firebasevertexai.templates.update",
    // ensureAILogicApiEnabled reads API enablement state via Service Usage.
    "serviceusage.services.get",
  ])
  .action(async (templateId: string, options: Options) => {
    const projectId = needProjectId(options);
    // Validate the id up front so bad input fails fast, before the API-enablement flow.
    ailogic.assertValidTemplateId(templateId);
    await ailogic.ensureAILogicApiEnabled(projectId, options);
    await ailogic.withTemplate404(templateId, () =>
      ailogic.setTemplateLocked(projectId, templateId, true),
    );
    utils.logSuccess(`Locked template: ${clc.bold(templateId)}`);
    return { templateId, locked: true };
  });
