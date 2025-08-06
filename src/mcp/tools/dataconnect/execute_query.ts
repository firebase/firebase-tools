import { z } from "zod";

import { tool } from "../../tool";
import { mcpError } from "../../util";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import { pickService } from "../../../dataconnect/fileUtils";
import { graphqlResponseToToolResponse, parseVariables } from "./converter";
import { Client } from "../../../apiv2";
import { getDataConnectEmulatorClient } from "./emulator";

export const execute_query = tool(
  {
    name: "execute_query",
    description:
      "Executes a deployed Data Connect query against a service or its emulator. Cannot write any data.",
    inputSchema: z.object({
      operationName: z.string().describe("The name of the deployed operation you want to execute"),
      service_id: z
        .string()
        .nullable()
        .describe(
          "The Firebase Data Connect service ID to look for. If there is only one service defined in firebase.json, this can be omitted and that will be used.",
        ),
      connector_id: z
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
      use_emulator: z.boolean().default(false).describe("Target the DataConnect emulator if true."),
    }),
    annotations: {
      title: "Executes a deployed Data Connect query.",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (
    { operationName, service_id, connector_id, variables: unparsedVariables, use_emulator },
    { projectId, config, host },
  ) => {
    const serviceInfo = await pickService(projectId, config, service_id || undefined);
    let apiClient: Client;

    if (!connector_id) {
      if (serviceInfo.connectorInfo.length === 0) {
        return mcpError(
          `Service ${serviceInfo.serviceName} has no connectors`,
          "NO_CONNECTORS_FOUND",
        );
      }
      if (serviceInfo.connectorInfo.length > 1) {
        return mcpError(
          `Service ${serviceInfo.serviceName} has more than one connector. Please use the connector_id argument to specify which connector this operation is part of.`,
          "MULTIPLE_CONNECTORS_FOUND",
        );
      }
      connector_id = serviceInfo.connectorInfo[0].connectorYaml.connectorId;
    }
    const connectorPath = `${serviceInfo.serviceName}/connectors/${connector_id}`;

    if (use_emulator) {
      apiClient = await getDataConnectEmulatorClient(host);
    } else {
      apiClient = dataplane.dataconnectDataplaneClient();
    }
    const response = await dataplane.executeGraphQLQuery(apiClient, connectorPath, {
      operationName,
      variables: parseVariables(unparsedVariables),
    });
    return graphqlResponseToToolResponse(response.body);
  },
);
