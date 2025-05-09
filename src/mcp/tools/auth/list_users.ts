import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { listUsers } from "../../../gcp/auth.js";

export const list_users = tool(
  {
    name: "list_users",
    description: "Retrieves all users in the project up to the specified limit.",
    inputSchema: z.object({
      limit: z.number().nullish().describe("The number of users to return - defaults to 100"),
    }),
    annotations: {
      title: "Get users from the Firebase project.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ limit }, { projectId }) => {
    if (!limit) {
      limit = 100;
    }

    return toContent(await listUsers(projectId!, limit));
  },
);
