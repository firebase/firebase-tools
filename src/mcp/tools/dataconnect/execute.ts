import { z } from "zod";

import { tool } from "../../tool";
import { mcpError } from "../../util";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import { pickService } from "../../../dataconnect/load";
import { graphqlResponseToToolResponse, parseVariables } from "./converter";
import { Client } from "../../../apiv2";
import { getDataConnectEmulatorClient } from "./emulator";

export const execute = tool(
  {
    name: "execute",
    description: "Executes a GraphQL operation against a Data Connect service or its emulator.",
    inputSchema: z
      .object({
        // Either query or operationName must be provided.
        query: z
          .string()
          .optional()
          .describe(
            "A GraphQL query or mutation to execute against the service. Cannot be used with operationName.",
          ),
        operationName: z
          .string()
          .optional()
          .describe(
            "The name of the deployed operation you want to execute. Cannot be used with query.",
          ),
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
            "The Firebase Data Connect connector ID to look for. Only used with operationName. If there is only one connector defined in dataconnect.yaml, this can be omitted and that will be used.",
          ),
        variables: z
          .string()
          .optional()
          .describe(
            "A stringified JSON object containing variables for the operation. MUST be valid JSON.",
          ),
        use_emulator: z
          .boolean()
          .default(false)
          .describe("Target the DataConnect emulator if true."),
        read_only: z
          .boolean()
          .default(false)
          .describe(
            "Whether the operation should be read-only. This will use a read-only endpoint.",
          ),
      })
      .superRefine((val, ctx) => {
        if (val.query && val.operationName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot provide both query and operationName.",
          });
        }
        if (!val.query && !val.operationName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Must provide either query or operationName.",
          });
        }
        if (val.connector_id && !val.operationName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "connector_id can only be used with operationName.",
          });
        }
      }),
    annotations: {
      title: "Execute Data Connect Operation",
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (
    {
      query,
      operationName,
      service_id,
      connector_id,
      variables: unparsedVariables,
      use_emulator,
      read_only,
    },
    { projectId, config, host },
  ) => {
    const serviceInfo = await pickService(projectId, config, service_id || undefined);

    let apiClient: Client;
    if (use_emulator) {
      apiClient = await getDataConnectEmulatorClient(host);
    } else {
      apiClient = dataplane.dataconnectDataplaneClient();
    }

    if (query) {
      if (read_only) {
        const response = await dataplane.executeGraphQLRead(apiClient, serviceInfo.serviceName, {
          name: "",
          query,
          variables: parseVariables(unparsedVariables),
        });
        return graphqlResponseToToolResponse(response.body);
      } else {
        const response = await dataplane.executeGraphQL(apiClient, serviceInfo.serviceName, {
          name: "",
          query,
          variables: parseVariables(unparsedVariables),
        });
        return graphqlResponseToToolResponse(response.body);
      }
    } else if (operationName) {
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
      if (read_only) {
        const response = await dataplane.executeGraphQLQuery(apiClient, connectorPath, {
          operationName,
          variables: parseVariables(unparsedVariables),
        });
        return graphqlResponseToToolResponse(response.body);
      } else {
        const response = await dataplane.executeGraphQLMutation(apiClient, connectorPath, {
          operationName,
          variables: parseVariables(unparsedVariables),
        });
        return graphqlResponseToToolResponse(response.body);
      }
    }
    // This should not be reached due to the superRefine
    return mcpError("Invalid input: must provide either query or operationName.", "INVALID_INPUT");
  },
);
