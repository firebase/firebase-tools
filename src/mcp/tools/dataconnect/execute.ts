import { z } from "zod";

import { tool } from "../../tool";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import { pickService } from "../../../dataconnect/load";
import { graphqlResponseToToolResponse, parseVariables } from "../../util/dataconnect/converter";
import { getDataConnectEmulatorClient } from "../../util/dataconnect/emulator";
import { Client } from "../../../apiv2";

export const execute = tool(
  "dataconnect",
  {
    name: "execute",
    description:
      "Use this to execute a GraphQL operation against a Data Connect service or its emulator.",
    inputSchema: z.object({
      query: z.string().describe(`A Firebase Data Connect GraphQL query or mutation to execute.
You can use the \`dataconnect_generate_operation\` tool to generate a query.
Example Data Connect schema and example queries can be found in files ending in \`.graphql\` or \`.gql\`.
`),
      service_id: z.string().optional()
        .describe(`Data Connect Service ID to dis-ambulate if there are multiple.
It's only necessary if there are multiple dataconnect sources in \`firebase.json\`.
You can find candidate service_id in \`dataconnect.yaml\`
`),
      variables_json: z
        .string()
        .optional()
        .describe(
          "GraphQL variables to pass into the query. MUST be a valid stringified JSON object.",
        ),
      auth_token_json: z
        .string()
        .optional()
        .describe(
          "Firebase Auth Token JWT to use in this query. MUST be a valid stringified JSON object." +
            'Importantly, when executing queries with `@auth(level: USER)` or `auth.uid`, a valid Firebase Auth Token JWT with "sub" field is required. ' +
            '"auth.uid" expression in the query evaluates to the value of "sub" field in Firebase Auth token.',
        ),
      use_emulator: z
        .boolean()
        .default(false)
        .describe(
          "If true, target the DataConnect emulator. Run `firebase emulators:start` to start it",
        ),
    }),
    annotations: {
      title: "Execute Firebase Data Connect Query",
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (
    {
      query,
      service_id,
      variables_json: unparsedVariables,
      use_emulator,
      auth_token_json: unparsedAuthToken,
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
    let executeGraphQL = dataplane.executeGraphQL;
    if (query.startsWith("query")) {
      executeGraphQL = dataplane.executeGraphQLRead;
    }
    const response = await executeGraphQL(apiClient, serviceInfo.serviceName, {
      query,
      variables: parseVariables(unparsedVariables),
      extensions: {
        impersonate: unparsedAuthToken
          ? {
              authClaims: parseVariables(unparsedAuthToken),
            }
          : undefined,
      },
    });
    return graphqlResponseToToolResponse(response.body);
  },
);
