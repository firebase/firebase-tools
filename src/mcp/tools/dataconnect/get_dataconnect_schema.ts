import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client";

export const get_dataconnect_schema = tool(
  {
    name: "get_dataconnect_schema",
    description:
      "List the Firebase Data Connect schema, which includes Cloud SQL data sources and the GraphQL Schema describing what tables are available.",
    inputSchema: z.object({
      serviceName: z
        .string()
        .nullish()
        .describe(
          "The Firebase Data Connect service name to look for. By default, it returns all schema in the project." +
            "(e.g. `<my-fdc-service-name>` or`locations/us-central1/services/<my-fdc-service-name>`)",
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
  async ({ serviceName }, { projectId }) => {
    // Cross-region aggregation list don't support filter on child resource name.
    // We list all resources in the project and do a client-side filtering.
    let schemas = await client.listSchemas(`projects/${projectId}/locations/-/services/-`, ["*"]);
    if (serviceName) {
      schemas = schemas?.filter((s) => (s.name as string).includes(serviceName));
    }
    return toContent(schemas);
  },
);
