import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { setCustomClaim } from "../../../gcp/auth.js";

export const set_auth_claim = tool(
  {
    name: "set_auth_claims",
    description:
      "Sets custom claims on a specific user's account. Use to create trusted values associated with a user e.g. marking them as an admin. Claims are limited in size and should be succinct in name and value.",
    inputSchema: z.object({
      uid: z.string().describe("the UID of the user to update"),
      claim: z.string().describe("the name (key) of the claim to update, e.g. 'admin'"),
      value: z
        .union([
          z.string(),
          z.number(),
          z.boolean(),
          z.record(z.union([z.string(), z.number(), z.boolean()])),
          z.array(z.union([z.string(), z.number(), z.boolean()])),
        ])
        .describe("the value of the custom claim"),
    }),
    annotations: {
      title: "Set a custom claim on a specific user.",
      idempotentHint: true,
    },
  },
  async ({ uid, claim, value }, { projectId }) => {
    if (!projectId) return mcpError(`No current project detected.`);
    try {
      return toContent(await setCustomClaim(projectId, uid, { [claim]: value }, { merge: true }));
    } catch (err: unknown) {
      return mcpError(err);
    }
  },
);
