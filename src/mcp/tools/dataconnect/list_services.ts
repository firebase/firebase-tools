import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import * as client from "../../../dataconnect/client";

export const list_services = tool(
  {
    name: "list_services",
    description: "List the Firebase Data Connect services available in the current project.",
    inputSchema: z.object({}),
    annotations: {
      title: "List Data Connect Services",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (_, { projectId }) => {
    const services = await client.listAllServices(projectId);
    return toContent(services, { format: "yaml" });
  },
);
