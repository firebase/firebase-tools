import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { setCustomClaim } from "../../../gcp/auth";

export const set_claim = tool(
  {
    name: "set_claim",
    description:
      "Sets a custom claim on a specific user's account. Use to create trusted values associated with a user e.g. marking them as an admin. Claims are limited in size and should be succinct in name and value. Specify ONLY ONE OF `value` or `json_value` parameters.",
    inputSchema: z.object({
      uid: z.string().describe("the UID of the user to update"),
      claim: z.string().describe("the name (key) of the claim to update, e.g. 'admin'"),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .optional()
        .describe(
          "Set the value of the custom claim to the specified simple scalar value. One of `value` or `json_value` must be provided.",
        ),
      json_value: z
        .string()
        .optional()
        .describe(
          "Set the claim to a complex JSON value like an object or an array by providing stringified JSON. String must be parseable as valid JSON. One of `value` or `json_value` must be provided.",
        ),
    }),
    annotations: {
      title: "Set custom Firebase Auth claim",
      idempotentHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ uid, claim, value, json_value }, { projectId }) => {
    if (value && json_value) return mcpError("Must supply only `value` or `json_value`, not both.");
    if (json_value) {
      try {
        value = JSON.parse(json_value);
      } catch (e) {
        return mcpError(`Provided \`json_value\` was not valid JSON: ${json_value}`);
      }
    }
    return toContent(await setCustomClaim(projectId, uid, { [claim]: value }, { merge: true }));
  },
);
