import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { getTemplate } from "../../../remoteconfig/get.js";

export const get_rc_template = tool(
  {
    name: "get_template",
    description: "Retrieves a remote config template for the project",
    inputSchema: z.object({
      versionNumber: z.string().optional(),
    }),
    annotations: {
      title: "Get remote config template",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ versionNumber }, { projectId }) => {
    if (projectId === undefined) {
      return mcpError(`No projectId specified in the get_template tool`);
    }
    return toContent(await getTemplate(projectId!, versionNumber));
  },
);
