import { z } from "zod";
import { tool } from "../../tool";
import { toContent, mcpError } from "../../util";
import { jobTracker } from "../../util/jobs";

export const deploy_status = tool(
  "core",
  {
    name: "deploy_status",
    description: "Check the status of a background deployment job using its Job ID.",
    inputSchema: z.object({
      jobId: z.string().describe("The Job ID returned by the deploy tool"),
    }),
    annotations: {
      title: "Check Deployment Status",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ jobId }) => {
    const job = jobTracker.getJob(jobId);
    if (!job) {
      return mcpError(`Job not found: ${jobId}`);
    }

    const contentRes = toContent(
      `Job ID: ${jobId}\nStatus: ${job.status}\nProgress: ${job.progress}%\n\nLogs:\n${job.logs.join("\n")}`,
    );
    return {
      ...contentRes,
      structuredContent: job,
    };
  },
);
