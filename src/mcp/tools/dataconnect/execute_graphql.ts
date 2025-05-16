import { z } from "zod";

import { tool } from "../../tool.js";
import * as dataplane from "../../../dataconnect/dataplaneClient.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { graphqlResponseToToolResponse, parseVariables } from "./converter.js";
import { Client } from "../../../apiv2.js";
import { getDataConnectEmulatorClient } from "./emulator.js";

export const execute_graphql = tool(
  {
    name: "execute_graphql",
    description: "Executes an arbitrary GraphQL against a Data Connect service or its emulator.",
    inputSchema: z.object({
      query: z.string().describe("A GraphQL query or mutation to execute against the service"),
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
      title: "Execute GraphQL Operation",
      readOnlyHint: false,
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
    const serviceInfo = await pickService(projectId!, config!, service_id || undefined);

    let apiClient: Client;

    if (use_emulator) {
      apiClient = await getDataConnectEmulatorClient(await host.getEmulatorHubClient());
    } else {
      apiClient = dataplane.dataconnectDataplaneClient();
    }

    const response = await dataplane.executeGraphQL(apiClient, serviceInfo.serviceName, {
      name: "",
      query,
      variables: parseVariables(unparsedVariables),
    });
    return graphqlResponseToToolResponse(response.body);
  },
);
