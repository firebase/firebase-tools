import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { connectorToText } from "./converter.js";

export const get_connectors = tool(
  {
    name: "get_connectors",
    description:
      "Get the Firebase Data Connect Connectors in the project, which includes the pre-defined GraphQL queries accessible to client SDKs.",
    inputSchema: z.object({
      service_id: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. If there is only one service defined in firebase.json, this can be omitted and that will be used.",
        ),
    }),
    annotations: {
      title: "Get Data Connect Connectors",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ service_id }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId!, config!, service_id || undefined);
    const connectors = await client.listConnectors(serviceInfo.serviceName, ["*"]);
    return toContent(connectors.map(connectorToText).join("\n\n"));
  },
);
