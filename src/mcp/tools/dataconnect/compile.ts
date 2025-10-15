import { z } from "zod";
import { tool } from "../../tool";
import { pickService } from "../../../dataconnect/load";
import { compileErrors } from "../../util/dataconnect/compile";

export const compile = tool(
  "dataconnect",
  {
    name: "build",
    description:
      "Use this to compile Firebase Data Connect schema, operations, and/or connectors and check for build errors.",
    inputSchema: z.object({
      error_filter: z
        .enum(["all", "schema", "operations"])
        .describe("filter errors to a specific type only. defaults to `all` if omitted.")
        .optional(),
      service_id: z
        .string()
        .optional()
        .describe(
          "The Firebase Data Connect service ID to look for. If omitted, builds all services defined in `firebase.json`.",
        ),
    }),
    annotations: {
      title: "Compile Data Connect",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: false,
      requiresAuth: false,
    },
  },
  async ({ service_id, error_filter }, { projectId, config }) => {
    const serviceInfo = await pickService(projectId, config, service_id || undefined);
    const errors = await compileErrors(serviceInfo.sourceDirectory, error_filter);
    if (errors)
      return {
        content: [
          {
            type: "text",
            text: `The following errors were encountered while compiling Data Connect from directory \`${serviceInfo.sourceDirectory}\`:\n\n${errors}`,
          },
        ],
        isError: true,
      };
    return { content: [{ type: "text", text: "Compiled successfully." }] };
  },
);
