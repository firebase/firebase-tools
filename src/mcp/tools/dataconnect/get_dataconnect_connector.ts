import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as client from "../../../dataconnect/client";

export const get_dataconnect_connector = tool(
  {
    name: "get_dataconnect_connector",
    description:
      "Get the Firebase Data Connect Connectors in the project, which includes the pre-defined GraphQL queries accessible to client SDKs.",
    inputSchema: z.object({
      name: z
        .string()
        .nullish()
        .describe(
          "The Firebase Data Connect Connector name to look for. By default, it returns all connectors in the project." +
          "(e.g. `<my-connector>`, `services/<my-service>/connectors/<my-connector>` or `locations/us-central1/services/<my-service>/connectors/<my-connector>``)",
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
  async ({ name }, { projectId }) => {
    // Cross-region aggregation list don't support filter on child resource name.
    // We list all resources in the project and do a client-side filtering.
    let connectors = await client.listConnectors(`projects/${projectId}/locations/-/services/-`, ["*"]);
    if (name) {
      connectors = connectors?.filter((s) => (s.name as string).includes(name));
    }
    return toContent(connectors);
  },
);
