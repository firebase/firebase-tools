import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { findUser, listUsers, UserInfo } from "../../../gcp/auth";

export const getUsersTool = tool(
  {
    name: "auth_get_users",
    description: "Retrieves users based on a list of UIDs or a list of emails.",
    inputSchema: z.object({
      uids: z
        .array(z.string())
        .optional()
        .describe("A list of user UIDs to retrieve. At most 100 UIDs can be provided."),
      emails: z
        .array(z.string())
        .optional()
        .describe("A list of user emails to retrieve. At most 100 emails can be provided."),
    }),
    annotations: {
      title: "Get Firebase Auth Users",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ uids, emails }, { projectId }) => {
    const prune = (user: UserInfo) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, salt, ...prunedUser } = user;
      return prunedUser;
    };
    let users: UserInfo[] = [];
    if (uids?.length) {
      const promises = uids.map((uid) =>
        findUser(projectId, undefined, undefined, uid).catch(() => null),
      );
      users.push(...(await Promise.all(promises)).filter((u): u is UserInfo => !!u));
    }
    if (emails?.length) {
      const promises = emails.map((email) =>
        findUser(projectId, email, undefined, undefined).catch(() => null),
      );
      users.push(...(await Promise.all(promises)).filter((u): u is UserInfo => !!u));
    }
    if (!uids?.length && !emails?.length) {
      users = await listUsers(projectId, 100);
    }
    return toContent(users.map(prune));
  },
);
