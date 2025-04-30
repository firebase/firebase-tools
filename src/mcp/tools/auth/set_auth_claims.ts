import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { setCustomClaim } from "../../../gcp/auth.js";

export const set_auth_claims = tool(
  {
    name: "set_auth_claims",
    description: "Sets a list of specific claims for a user.",
    inputSchema: z.object({
      uid: z.string().describe("the UID or localId of the user to update"),
      claim: z.string().describe("the key value int he custom claim to update"),
      value: z
        .union([z.string(), z.boolean(), z.number()])
        .describe("the value of the custom claim"),
    }),
    annotations: {
      title: "Set a custom claim on a specific user.",
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  async ({ uid, claim, value }, { projectId }) => {
    if (!projectId) return mcpError(`No current project detected.`);
    try {
      return toContent(await setCustomClaim(projectId, uid, claim, value));
    } catch (err: unknown) {
      return mcpError(err);
    }
  },
);
