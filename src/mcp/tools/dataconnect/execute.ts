import { z } from "zod";

import { tool } from "../../tool";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import { pickOneService } from "../../../dataconnect/load";
import { graphqlResponseToToolResponse, parseVariables } from "../../util/dataconnect/converter";
import { getDataConnectEmulatorClient } from "../../util/dataconnect/emulator";

export const execute_in_emulator = tool(
  "dataconnect",
  {
    name: "execute_in_emulator",
    description: `Executes a GraphQL operation against a local Firebase SQL Connect Service instance emulator.

Grants access to run queries and mutations on the local emulator.

**Prerequisites:**
* The Firebase local emulators must be running (run \`firebase emulators:start\` in your project directory).
* A \`firebase.json\` file configured with a \`dataconnect\` service.
* A \`dataconnect.yaml\` configuration file inside the service's source directory.
* A defined SQL Connect schema (configured via the schema/schemas fields in \`dataconnect.yaml\`).
  * Note: These files are ideally generated using the \`firebase_init\` MCP tool, or must follow the standard structure described in the \`firebase-data-connect-basics\` skill.

**When to use it:**
* Use this tool to execute local GraphQL queries or mutations for development and testing.

**How to use it:**
* Call \`execute_in_emulator\` with the GraphQL \`query\` string.
* Optionally provide \`service_id\`, \`location_id\`, \`variables_json\`, and \`auth_token_json\`.

**JSON Example:**
\`\`\`json
{
  "query": "query GetUser($id: UUID!) { user(id: $id) { name } }",
  "variables_json": "{\\"id\\": \\"123e4567-e89b-12d3-a456-426614174000\\"}"
}
\`\`\`
`,
    inputSchema: z.object({
      query: z.string().describe(`A Firebase SQL Connect GraphQL query or mutation to execute.
Example SQL Connect schema and example queries can be found in files ending in \`.graphql\` or \`.gql\`.
`),
      service_id: z
        .string()
        .optional()
        .describe(
          `Service ID of the SQL Connect service to compile. Used to disambiguate when there are multiple SQL Connect services in firebase.json.`,
        ),
      location_id: z
        .string()
        .optional()
        .describe(
          `SQL Connect Service location ID to disambiguate among multiple SQL Connect services.`,
        ),
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
    }),
    annotations: {
      title: "Execute Firebase SQL Connect Query in Emulator",
    },
    _meta: {
      requiresProject: true,
      requiresAuth: false,
    },
  },
  async (
    {
      query,
      service_id,
      location_id,
      variables_json: unparsedVariables,
      auth_token_json: unparsedAuthToken,
    },
    { projectId, config, host },
  ) => {
    const serviceInfo = await pickOneService(
      projectId,
      config,
      service_id || undefined,
      location_id || undefined,
    );
    const apiClient = await getDataConnectEmulatorClient(host);
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
