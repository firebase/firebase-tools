import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { toggleUserEnablement, setCustomClaim } from "../../../gcp/auth";

export const update_user = tool(
  {
    name: "update_user",
    description: "Disables, enables, or sets a custom claim on a specific user's account.",
    inputSchema: z.object({
      uid: z.string().describe("the UID of the user to update"),
      disabled: z.boolean().optional().describe("true disables the user, false enables the user"),
      claim: z.string().optional().describe("the name (key) of the claim to update, e.g. 'admin'"),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .optional()
        .describe(
          "Set the value of the custom claim to the specified simple scalar value. One of `value` or `json_value` must be provided if setting a claim.",
        ),
      json_value: z
        .string()
        .optional()
        .describe(
          "Set the claim to a complex JSON value like an object or an array by providing stringified JSON. String must be parseable as valid JSON. One of `value` or `json_value` must be provided if setting a claim.",
        ),
    }),
    annotations: {
      title: "Update a user",
      idempotentHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ uid, disabled, claim, value, json_value }, { projectId }) => {
    if (disabled === undefined && !claim) {
      return mcpError("At least one of 'disabled' or 'claim' must be provided to update the user.");
    }
    if (claim && value === undefined && json_value === undefined) {
      return mcpError(
        "When providing 'claim', you must also provide either 'value' or 'json_value'.",
      );
    }
    if (disabled !== undefined) {
      try {
        await toggleUserEnablement(projectId, uid, disabled);
      } catch (err: any) {
        return mcpError(`Failed to ${disabled ? "disable" : "enable"} user ${uid}`);
      }
    }

    if (claim) {
      if (value && json_value) {
        return mcpError("Must supply only `value` or `json_value`, not both.");
      }
      let claimValue = value;
      if (json_value) {
        try {
          claimValue = JSON.parse(json_value);
        } catch (e) {
          return mcpError(`Provided \`json_value\` was not valid JSON: ${json_value}`);
        }
      }
      try {
        await setCustomClaim(projectId, uid, { [claim]: claimValue }, { merge: true });
      } catch (e: any) {
        let errorMsg = `Failed to set claim: ${e.message}`;
        if (disabled !== undefined) {
          errorMsg = `User was successfully ${disabled ? "disabled" : "enabled"}, but setting the claim failed: ${e.message}`;
        }
        return mcpError(errorMsg);
      }
    }
    const messageParts = [];
    if (disabled !== undefined) {
      messageParts.push(`User ${disabled ? "disabled" : "enabled"}`);
    }
    if (claim) {
      messageParts.push(`Claim '${claim}' set`);
    }

    return toContent(`Successfully updated user ${uid}. ${messageParts.join(". ")}.`);
  },
);
