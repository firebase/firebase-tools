import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { getTemplate } from "../../../remoteconfig/get.js";

export const get_rc_template = tool(
  {
    name: "get_template",
    description:
      "Retrieves a remote config template for the project." +
      "If 'version_number' is omitted, the latest version will be returned.",
    inputSchema: z.object({
      version_number: z
        .number()
        .optional()
        .describe("Specifiy version number to fetch specific version of the template"),
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
  async ({ version_number }, { projectId }) => {
    return toContent(await getTemplate(projectId!, version_number?.toString()));
  },
);
