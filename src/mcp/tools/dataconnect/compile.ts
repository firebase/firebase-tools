import { z } from "zod";
import { tool } from "../../tool";
import { compileErrors } from "../../util/dataconnect/compile";
import { pickServices } from "../../../dataconnect/load";

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
          `Service ID of the Data Connect service to compile. Used to disambiguate when there are multiple Data Connect services in firebase.json.`,
        ),
      location_id: z
        .string()
        .optional()
        .describe(
          `Data Connect Service location ID to disambiguate among multiple Data Connect services.`,
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
    ).flat();
    if (errors.length > 0)
      return {
        content: [
          {
            type: "text",
            text: `The following errors were encountered while compiling Data Connect:\n\n${errors.join("\n")}`,
          },
        ],
        isError: true,
      };
    return { content: [{ type: "text", text: "Compiled successfully." }] };
  },
);
