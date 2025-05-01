import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client.js";

export const get_dataconnect_service = tool(
  {
    name: "get_dataconnect_service",
    description: "Get the Firebase Data Connect services available in the current project.",
    inputSchema: z.object({
      name: z
        .string()
        .nullish()
        .describe(
          "The Firebase Data Connect service name to look for. By default, it returns all service in the project." +
          "(e.g. `<my-fdc-service-name>` or`locations/us-central1/services/<my-fdc-service-name>`)",
        ),
    }),
    annotations: {
      title: "Get the Firebase Data Connect Services that's available in the backend",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ name }, { projectId }) => {
    let services = await client.listAllServices(projectId!);
    if (name) {
      services = services?.filter((s) => (s.name as string).includes(name));
    }
    return toContent(services, { format: "yaml" });
  },
);
