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
      useEmulator: z.boolean().default(false).describe("Target the DataConnect emulator if true."),
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
  async (
    { query, serviceId, variables: unparsedVariables, useEmulator },
    { projectId, config, host },
  ) => {
    const serviceInfo = await pickService(projectId!, config!, serviceId || undefined);

    let apiClient: Client;

    if (useEmulator) {
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
