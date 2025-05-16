import { z } from "zod";
import { tool } from "../../tool.js";
import { getProject } from "../../../management/projects.js";
import { toContent } from "../../util.js";

export const get_project = tool(
  {
    name: "get_project",
    description: "Retrieves information about the currently active Firebase project.",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Current Firebase Project",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (_, { projectId }) => {
    return toContent(await getProject(projectId!));
  },
);
