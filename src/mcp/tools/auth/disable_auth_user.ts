import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { disableUser } from "../../../gcp/auth.js";

export const disable_auth_user = tool(
  {
    name: "disable_auth_user",
    description: "Disables or enables a user based on a UID.",
    inputSchema: z.object({
      uid: z.string().describe("The localId or UID of the user to disable or enable"),
      disabled: z.boolean().describe("true disables the user, false enables the user"),
    }),
    annotations: {
      title: "Disable or enable a particular user",
      readOnlyHint: true,
    },
  },
  async ({ uid, disabled }, { projectId }) => {
    if (!projectId) return mcpError(`No current project detected.`);
    try {
      const res = await disableUser(projectId, uid, disabled);
      if (res) {
        return toContent(`User ${uid} as been ${disabled ? "disabled" : "enabled"}`);
      }
      return toContent(`Failed to ${disabled ? "disable" : "enable"} user ${uid}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        return mcpError(err.message);
      } else {
        return mcpError("unknown error");
      }
    }
  },
);
