import { z } from "zod";

import { tool } from "../../tool.js";
import { mcpError } from "../../util.js";
import * as client from "../../../dataconnect/dataplaneClient.js";
import { pickService } from "../../../dataconnect/fileUtils.js";
import { graphqlResponseToToolResponse } from "./converter.js";

export const execute_mutation = tool(
  {
    name: "execute_mutation",
    description: "Executes a deployed Data Connect mutation. Can read and write data.",
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
        .record(z.string())
        .optional()
        .describe(
          "Variables for this operation. Use dataconnect_get_connector to find the expected variables for this query",
        ),
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
  async ({ operationName, serviceId, connectorId, variables }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId!, config!, serviceId || undefined);
    if (!connectorId) {
      if (serviceInfo.connectorInfo.length === 0) {
        return mcpError(`Service ${serviceInfo.serviceName} has no connectors`);
      }
      if (serviceInfo.connectorInfo.length > 1) {
        return mcpError(
          `Service ${serviceInfo.serviceName} has more than one connector. Please use the connectorId argument to specifiy which connector this operation is part of.`,
        );
      }
      connectorId = serviceInfo.connectorInfo[0].connectorYaml.connectorId;
    }
    const connectorPath = `${serviceInfo.serviceName}/connectors/${connectorId}`;
    const response = await client.executeGraphQLMutation(
      client.dataconnectDataplaneClient(),
      connectorPath,
      { operationName, variables },
    );
    return graphqlResponseToToolResponse(response.body);
  },
);
