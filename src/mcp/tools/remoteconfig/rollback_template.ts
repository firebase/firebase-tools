import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { rollbackTemplate } from "../../../remoteconfig/rollback";

export const rollback_template = tool(
  {
    name: "rollback_template",
    description: "Rollback to a specific version of Remote Config template for a project",
    inputSchema: z.object({
      version_number: z
        .number()
        .describe("The version number to roll back to. This field is required."),
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
    return toContent(await rollbackTemplate(projectId, version_number!));
  },
);
