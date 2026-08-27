import { z } from "zod";
import { tool } from "../../tool";
import { compileErrors } from "../../util/dataconnect/compile";
import { pickServices } from "../../../dataconnect/load";

export const compile = tool(
  "dataconnect",
  {
    name: "build",
    description: `Use this to compile Firebase SQL Connect schema, operations, and/or connectors and check for build errors.

Resolves service directories defined in the project's \`firebase.json\` under \`dataconnect\`, reads \`dataconnect.yaml\` to locate schema and connector directories, and validates all \`*.gql\` and \`*.graphql\` files within them.

**Prerequisites:**
* A \`firebase.json\` file at the root of the project with a configured \`dataconnect\` section.
* A local SQL Connect service directory containing a \`dataconnect.yaml\` file and GraphQL source files.
* Note: These files are ideally generated using the \`firebase_init\` MCP tool, or must follow the standard structure described in the \`firebase-data-connect-basics\` skill.

**When to use it:**
* Use this tool to compile schemas and operations, and check for syntax or type errors in your SQL Connect files.

**How to use it:**
* Call the tool to compile all services, or filter results by \`service_id\`, \`location_id\`, or \`error_filter\`.

**JSON Example:**
\`\`\`json
{
  "service_id": "my-service",
  "error_filter": "schema"
}
\`\`\``,
    inputSchema: z.object({
      error_filter: z
        .enum(["all", "schema", "operations"])
        .describe("filter errors to a specific type only. defaults to `all` if omitted.")
        .optional(),
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
    }),
    annotations: {
      title: "Compile SQL Connect",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: false,
      requiresAuth: false,
    },
  },
  async ({ service_id, location_id, error_filter }, { projectId, config }) => {
    const serviceInfos = await pickServices(
      projectId,
      config,
      service_id || undefined,
      location_id || undefined,
    );
    const errors = (
      await Promise.all(
        serviceInfos.map(async (serviceInfo) => {
          return await compileErrors(serviceInfo.sourceDirectory, error_filter);
        }),
      )
    ).filter(Boolean);
    if (errors.length > 0)
      return {
        content: [
          {
            type: "text",
            text: `The following errors were encountered while compiling SQL Connect:\n\n${errors.join("\n")}`,
          },
        ],
        isError: true,
      };
    return { content: [{ type: "text", text: "Compiled successfully." }] };
  },
);
