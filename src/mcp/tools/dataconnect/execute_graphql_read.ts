import { z } from "zod";

import { tool } from "../../tool";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import { pickService } from "../../../dataconnect/fileUtils";
import { graphqlResponseToToolResponse, parseVariables } from "./converter";
import { Client } from "../../../apiv2";
import { getDataConnectEmulatorClient } from "./emulator";

export const execute_graphql_read = tool(
  {
    name: "execute_graphql_read",
    description:
      "Executes an arbitrary GraphQL query against a Data Connect service or its emulator. Cannot write data.",
    inputSchema: z.object({
      query: z.string().describe("A GraphQL query to execute against the service"),
      service_id: z
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
      use_emulator: z.boolean().default(false).describe("Target the DataConnect emulator if true."),
    }),
    annotations: {
      title: "Execute Data Connect GraphQL Query",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (
    { query, service_id, variables: unparsedVariables, use_emulator },
    { projectId, config, host },
  ) => {
    const serviceInfo = await pickService(projectId, config, service_id || undefined);

    let apiClient: Client;
    if (use_emulator) {
      apiClient = await getDataConnectEmulatorClient(host);
    } else {
      apiClient = dataplane.dataconnectDataplaneClient();
    }

    const response = await dataplane.executeGraphQLRead(apiClient, serviceInfo.serviceName, {
      name: "",
      query,
      variables: parseVariables(unparsedVariables),
    });
    return graphqlResponseToToolResponse(response.body);
  },
);
