import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { findUser } from "../../../gcp/auth.js";

export const get_auth_user = tool(
  {
    name: "get_auth_user",
    description: "Retrieves a user based on an email address, phone number, or UID.",
    inputSchema: z.object({
      email: z.string().optional(),
      phoneNumber: z.string().optional(),
      uid: z.string().optional(),
    }),
    annotations: {
      title: "Get information about 1 user.",
      readOnlyHint: true,
    },
  },
  async ({ email, phoneNumber, uid }, { projectId }) => {
    if (email === undefined && phoneNumber === undefined && uid === undefined) {
      return mcpError(`No user identifier supplied in get_auth_user tool`);
    }
    if (!projectId) return mcpError(`No current project detected.`);
    try {
      return toContent(await findUser(projectId, email, phoneNumber, uid));
    } catch (err: unknown) {
      return mcpError(err);
    }
  },
);
