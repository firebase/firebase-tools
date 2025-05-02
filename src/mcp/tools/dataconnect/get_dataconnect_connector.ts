import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client";
import { pickService } from "../../../dataconnect/fileUtils.js";

export const get_dataconnect_connector = tool(
  {
    name: "get_dataconnect_connector",
    description:
      "Get the Firebase Data Connect Connectors in the project, which includes the pre-defined GraphQL queries accessible to client SDKs.",
    inputSchema: z.object({
      serviceId: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. By default, it would pick the the service ID project directory.",
        ),
    }),
    annotations: {
      title: "Obtain the Firebase Data Connect Connectors that's available in the backend",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ serviceId }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId!, config!, serviceId || undefined);
    const connectors = await client.listConnectors(serviceInfo.serviceName, ["*"]);
    return toContent(connectors);
  },
);
