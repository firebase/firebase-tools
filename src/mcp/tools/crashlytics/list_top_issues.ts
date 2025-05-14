import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { listTopIssues } from "../../../crashlytics/listTopIssues.js";

export const list_top_issues = tool(
    {
        name:"list_top_issues",
        description: "List the top issues happening in the application.",
        inputSchema: z.object({
            platform: z.string(),
            packageName: z.string(),
            issueCount: z.string().optional(),
        }),
        annotations: {
            title: "Get the list of top issues in the application",
            readOnlyHint: true,
        },
        _meta: {
            requiresAuth: true,
            requiresProject: true,
        },
    },
    async ({ platform, packageName, issueCount }, { projectId }) => {
        if (projectId === undefined) {
          return mcpError(`No projectId specified in the tool to get the list of issues.`);
        }
        if (platform === undefined) {
            return mcpError(`Platform is a required information to get the list of issues.`);
        }
        if (packageName === undefined) {
            return mcpError(`Package name is a required information to get the list of issues.`);
        }
        if (issueCount === undefined) {
            issueCount = "10"
        }
        return toContent(await listTopIssues(projectId, platform, packageName, issueCount));
      },
)