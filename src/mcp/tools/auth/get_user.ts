import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { findUser } from "../../../gcp/auth.js";

export const get_user = tool(
  {
    name: "get_user",
    description: "Retrieves a user based on an email address, phone number, or UID.",
    inputSchema: z.object({
      email: z.string().optional(),
      phone_number: z.string().optional(),
      uid: z.string().optional(),
    }),
    annotations: {
      title: "Get information about 1 user.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ email, phone_number, uid }, { projectId }) => {
    if (email === undefined && phone_number === undefined && uid === undefined) {
      return mcpError(`No user identifier supplied in auth_get_user tool`);
    }
    return toContent(await findUser(projectId!, email, phone_number, uid));
  },
);
