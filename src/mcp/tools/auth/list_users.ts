import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { listUsers } from "../../../gcp/auth";

export const list_users = tool(
  {
    name: "list_users",
    description: "Retrieves all users in the project up to the specified limit.",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("The number of users to return. Defaults to 100 if not supplied."),
    }),
    annotations: {
      title: "List Firebase Users",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ limit } = {}, { projectId }) => {
    if (!limit) {
      limit = 100;
    }

    const users = await listUsers(projectId, limit);
    const usersPruned = users.map((user) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, salt, ...prunedUser } = user;
      return prunedUser;
    });

    return toContent(usersPruned);
  },
);
