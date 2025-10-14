import { z } from "zod";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { getProject } from "../../../management/projects";
import { toContent } from "../../util";

export const get_project = tool(
  {
    name: "get_project",
    description: "Use this to retrieve information about the currently active Firebase Project.",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Current Firebase Project",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
    isAvailable: async (_ctx: McpContext) => {
      return true;
    },
  },
  async (_, { projectId }) => {
    return toContent(await getProject(projectId));
  },
);
