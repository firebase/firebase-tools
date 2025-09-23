import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { disableUser } from "../../../gcp/auth";

export const disable_user = tool(
  {
    name: "disable_user",
    description: "Disables or enables a user based on a UID.",
    inputSchema: z.object({
      uid: z.string().describe("The localId or UID of the user to disable or enable"),
      disabled: z.boolean().describe("true disables the user, false enables the user"),
    }),
    annotations: {
      title: "Disable or enable a particular user",
      destructiveHint: true,
      idempotentHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ uid, disabled }, { projectId }) => {
    const res = await disableUser(projectId, uid, disabled);
    if (res) {
      return toContent(`User ${uid} has been ${disabled ? "disabled" : "enabled"}`);
    }
    return toContent(`Failed to ${disabled ? "disable" : "enable"} user ${uid}`);
  },
);
