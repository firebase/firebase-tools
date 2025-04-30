import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { AppPlatform, getAppConfig, listFirebaseApps } from "../../../management/apps.js";
import * as client from "../../../dataconnect/client";

export const list_dataconnect_services = tool(
  {
    name: "list_dataconnect_services",
    description: "List the Firebase Data Connect Services Deploy.",
    inputSchema: z.object({}),
    annotations: {
      title: "List the Firebase Data Connect Services that's available in the backend",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
    },
  },
  async (_, { projectId }) => {
    if (!projectId) return mcpError("No current project detected.");
    const services = await client.listAllServices(projectId);
    return toContent(services, { format: "yaml" });
  },
);
