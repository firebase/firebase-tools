import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import * as client from "../../../dataconnect/client";
import { pickService } from "../../../dataconnect/fileUtils";
import { schemaToText } from "./converter";

export const get_schema = tool(
  {
    name: "get_schema",
    description:
      "Retrieve information about the Firebase Data Connect Schema in the project, including Cloud SQL data sources and the GraphQL Schema describing the data model.",
    inputSchema: z.object({
      service_id: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. If there is only one service defined in firebase.json, this can be omitted and that will be used.",
        ),
    }),
    annotations: {
      title: "Get Data Connect Schemas",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ service_id }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId, config, service_id || undefined);
    const schemas = await client.listSchemas(serviceInfo.serviceName, ["*"]);
    return toContent(schemas?.map(schemaToText).join("\n\n"));
  },
);
