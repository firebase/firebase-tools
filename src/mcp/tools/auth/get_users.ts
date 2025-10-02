import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { findUser, listUsers, UserInfo } from "../../../gcp/auth";

export const get_users = tool(
  {
    name: "auth_get_users",
    description: "Use this to retrieve a Firebase app user's account information by specifying an email address, phone number, or UID.",
    inputSchema: z.object({
      uids: z.array(z.string()).optional().describe("A list of user UIDs to retrieve."),
      emails: z.array(z.string()).optional().describe("A list of user emails to retrieve."),
      phone_numbers: z
        .array(z.string())
        .optional()
        .describe("A list of user phone numbers to retrieve."),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("The numbers of users to return. 500 is the upper limit. Defaults to 100."),
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
  async ({ uids, emails, phone_numbers, limit }, { projectId }) => {
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
    if (phone_numbers?.length) {
      const promises = phone_numbers.map((phone) =>
        findUser(projectId, undefined, phone, undefined).catch(() => null),
      );
      users.push(...(await Promise.all(promises)).filter((u): u is UserInfo => !!u));
    }
    if (!uids?.length && !emails?.length && !phone_numbers?.length) {
      users = await listUsers(projectId, limit || 100);
    }
    return toContent(users.map(prune));
  },
);
