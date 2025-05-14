import { z } from "zod";

import { tool } from "../../tool.js";
import * as dataplane from "../../../dataconnect/dataplaneClient.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { graphqlResponseToToolResponse, parseVariables } from "./converter.js";
import { mcpError } from "../../util.js";
import { Client } from "../../../apiv2.js";
import { getDataConnectEmulatorDetails } from "../../emulator/dataconnectEmulatorController.js";

export const execute_graphql_read = tool(
  {
    name: "execute_graphql_read",
    description:
      "Executes an arbitrary GraphQL query against a Data Connect service or its emulator. Cannot write data.",
    inputSchema: z.object({
      query: z.string().describe("A GraphQL query to execute against the service"),
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
      useEmulator: z.boolean().optional().describe("Target the DataConnect emulator if true."),
    }),
    annotations: {
      title: "Executes a arbitrary GraphQL query against a Data Connect service",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (
    { query, serviceId, variables: unparsedVariables, useEmulator },
    { projectId, config, emulatorHubClient },
  ) => {
    if (!projectId) {
      return mcpError("Project ID is required but not found.", "PROJECT_ID_MISSING");
    }
    const serviceInfo = await pickService(projectId, config, serviceId || undefined);

    let apiClient: Client;

    if (useEmulator) {
      const emulatorDetails = await getDataConnectEmulatorDetails(emulatorHubClient);

      if (!emulatorDetails) {
        return mcpError(
          "DataConnect emulator requested but not found or not running. Please ensure the emulator is started and the project ('firebase.json') is correctly configured.",
          "EMULATOR_NOT_FOUND",
        );
      }
      apiClient = new Client({
        urlPrefix: emulatorDetails.url,
        apiVersion: dataplane.DATACONNECT_API_VERSION,
        auth: false,
      });
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
