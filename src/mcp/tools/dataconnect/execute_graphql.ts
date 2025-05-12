import { z } from "zod";

import { tool } from "../../tool.js";
import * as client from "../../../dataconnect/dataplaneClient.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { graphqlResponseToToolResponse, parseVariables } from "./converter.js";

export const execute_graphql = tool(
  {
    name: "execute_graphql",
    description: "Executes an arbitrary GraphQL against a Data Connect service",
    inputSchema: z.object({
      query: z.string().describe("A GraphQL query or mutation to execute against the service"),
      serviceId: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. If there is only one service defined in firebase.json, this can be omitted and that will be used.",
        ),
      variables: z
        .string()
        .optional()
        .describe(
          "A stringified JSON object containing variables for the operation. MUST be valid JSON.",
        ),
    }),
    annotations: {
      title: "Executes a arbitrary GraphQL query or mutation against a Data Connect service",
      readOnlyHint: false,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ query, serviceId, variables: unparsedVariables }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId!, config!, serviceId || undefined);
    const response = await client.executeGraphQL(
      client.dataconnectDataplaneClient(),
      serviceInfo.serviceName,
      { name: "", query, variables: parseVariables(unparsedVariables) },
    );
    return graphqlResponseToToolResponse(response.body);
  },
);
