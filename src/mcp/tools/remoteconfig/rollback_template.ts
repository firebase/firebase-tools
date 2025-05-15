import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { rollbackTemplate } from "../../../remoteconfig/rollback.js";

export const rollback_rc_template = tool(
  {
    name: "rollback_template",
    description: "Rolls back a previous version of the project's Remote Config template.",
    inputSchema: z.object({
      version_number: z.number().describe("Required version number to rollback to"),
    }),
    annotations: {
      title: "Rollback remote config template",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ version_number }, { projectId }) => {
    if (version_number === undefined) {
      return mcpError(`No version number specified in the rollback requests`);
    }
    return toContent(await rollbackTemplate(projectId!, version_number!));
  },
);
