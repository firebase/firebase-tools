import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { updateIssue, IssueState } from "../../../crashlytics/updateIssue";
import { APP_ID_FIELD } from "./constants";

export const update_issue = tool(
  {
    name: "update_issue",
    description: "Update the state of an issue in Crashlytics.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().describe("The issue id to update."),
      state: z
        .nativeEnum(IssueState)
        .describe("The new state for the issue. Can be 'OPEN' or 'CLOSED'."),
    }),
    annotations: {
      title: "Update Crashlytics issue state.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, state }) => {
    if (!app_id) {
      return mcpError(`Must specify 'app_id' parameter.`);
    }
    if (!issue_id) {
      return mcpError(`Must specify 'issue_id' parameter.`);
    }
    if (!state) {
      return mcpError(`Must specify 'state' parameter.`);
    }

    return toContent(await updateIssue(app_id, issue_id, state));
  },
);
