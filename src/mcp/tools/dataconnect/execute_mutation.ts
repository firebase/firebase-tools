import { z } from "zod";

import { tool } from "../../tool.js";
import { mcpError } from "../../util.js";
import * as dataplane from "../../../dataconnect/dataplaneClient.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { graphqlResponseToToolResponse, parseVariables } from "./converter.js";
import { Client } from "../../../apiv2.js";
import { getDataConnectEmulatorClient } from "./emulator.js";

export const execute_mutation = tool(
  {
    name: "execute_mutation",
    description:
      "Executes a deployed Data Connect mutation against a service or its emulator. Can read and write data.",
    inputSchema: z.object({
      operationName: z.string().describe("The name of the deployed operation you want to execute"),
      serviceId: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. If there is only one service defined in firebase.json, this can be omitted and that will be used.",
        ),
      connectorId: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect connector ID to look for. If there is only one connector defined in dataconnect.yaml, this can be omitted and that will be used.",
        ),
      variables: z
        .string()
        .optional()
        .describe(
          "A stringified JSON object containing the variables needed to execute the operation. The value MUST be able to be parsed as a JSON object.",
        ),
      useEmulator: z.boolean().default(false).describe("Target the DataConnect emulator if true."),
    }),
    annotations: {
      title: "Executes a deployed Data Connect query or mutation",
      readOnlyHint: false,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (
    { operationName, serviceId, connectorId, variables: unparsedVariables, useEmulator },
    { projectId, config, host },
  ) => {
    const serviceInfo = await pickService(projectId!, config, serviceId || undefined);
    let apiClient: Client;

    if (!connectorId) {
      if (serviceInfo.connectorInfo.length === 0) {
        return mcpError(
          `Service ${serviceInfo.serviceName} has no connectors`,
          "NO_CONNECTORS_FOUND",
        );
      }
      if (serviceInfo.connectorInfo.length > 1) {
        return mcpError(
          `Service ${serviceInfo.serviceName} has more than one connector. Please use the connectorId argument to specify which connector this operation is part of.`,
          "MULTIPLE_CONNECTORS_FOUND",
        );
      }
      connectorId = serviceInfo.connectorInfo[0].connectorYaml.connectorId;
    }
    const connectorPath = `${serviceInfo.serviceName}/connectors/${connectorId}`;

    if (useEmulator) {
      apiClient = await getDataConnectEmulatorClient(await host.getEmulatorHubClient());
    } else {
      apiClient = dataplane.dataconnectDataplaneClient();
    }
    const response = await dataplane.executeGraphQLMutation(apiClient, connectorPath, {
      operationName,
      variables: parseVariables(unparsedVariables),
    });
    return graphqlResponseToToolResponse(response.body);
  },
);
