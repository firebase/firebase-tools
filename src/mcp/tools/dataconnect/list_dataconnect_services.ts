import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client";
import { NO_PROJECT_ERROR } from "../../errors.js";

export const list_dataconnect_services = tool(
  {
    name: "list_dataconnect_services",
    description: "List the Firebase Data Connect services available in the current project.",
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
    if (!projectId) return NO_PROJECT_ERROR;
    const services = await client.listAllServices(projectId);
    return toContent(services, { format: "yaml" });
  },
);
