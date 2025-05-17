import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { NO_PROJECT_ERROR } from "../../errors.js";
import { fetchServiceLogs } from "../../../gcp/run.js";

export const fetch_logs = tool(
  {
    name: "fetch_logs",
    description:
      "Fetches recent logs for a Cloud Run service. Includes details such as the message, severity, and timestamp.",
    inputSchema: z.object({
      serviceId: z.string().describe("The Cloud Run service ID."),
    }),
    annotations: {
      title: "Fetch recent Cloud Run service logs.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ serviceId } = {}, { projectId }) => {
    if (!projectId) return NO_PROJECT_ERROR;
    if (!serviceId) return toContent("A Cloud Run service ID must be provided.");
    const data = await fetchServiceLogs(projectId, serviceId);
    return toContent(data);
  },
);
