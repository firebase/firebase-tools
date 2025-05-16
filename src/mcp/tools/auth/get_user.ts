import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { findUser } from "../../../gcp/auth.js";

export const get_user = tool(
  {
    name: "get_user",
    description: "Retrieves a user based on an email address, phone number, or UID.",
    inputSchema: z.object({
      email: z
        .string()
        .optional()
        .describe(
          "The user's email address. At least one of email, phone_number, or uid must be provided.",
        ),
      phone_number: z
        .string()
        .optional()
        .describe(
          "The user's phone number. At least one of email, phone_number, or uid must be provided.",
        ),
      uid: z
        .string()
        .optional()
        .describe("The user's UID. At least one of email, phone_number, or uid must be provided."),
    }),
    annotations: {
      title: "Get Firebase Auth User",
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
