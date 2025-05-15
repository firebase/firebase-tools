import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { rollbackTemplate } from "../../../remoteconfig/rollback.js";

export const rollback_rc_template = tool(
  {
    name: "rollback_template",
    description: "Rollback to a specific version of Remote Config template for a project",
    inputSchema: z.object({
      versionNumber: z.number().optional(),
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
  async ({ versionNumber }, { projectId }) => {
    if (versionNumber === undefined) {
      return mcpError(`No version number specified in the rollback requests`);
    }
    return toContent(await rollbackTemplate(projectId!, versionNumber!));
  },
);
