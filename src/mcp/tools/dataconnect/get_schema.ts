import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { schemaToText } from "./converter.js";

export const get_schema = tool(
  {
    name: "get_schema",
    description:
      "List the Firebase Data Connect Schema in the project, which includes Cloud SQL data sources and the GraphQL Schema describing what tables are available.",
    inputSchema: z.object({
      serviceId: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. If there is only one service defined in firebase.json, this can be omitted and that will be used.",
        ),
    }),
    annotations: {
      title: "Obtain the Firebase Data Connect Schemas that's available in the backend",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ serviceId }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId!, config!, serviceId || undefined);
    const schemas = await client.listSchemas(serviceInfo.serviceName, ["*"]);
    return toContent(schemas?.map(schemaToText).join("\n\n"));
  },
);
