import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { generateOperation } from "../../../gif/fdcExperience.js";

export const generate_dataconnect_operation = tool(
  {
    name: "generate_dataconnect_operation",
    description: "Generates a single Firebase Data Connect query or mutation based on the currently deployed schema and the provided prompt.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("A description of the query or mutation operation you would like to generate"),
      service: z
        .string()
        .describe(
          "The service id or name of the deployed Firebase Data Connect Schema in format: projects/<project-id>/locations/<location>/services/<service-name>",
        ),
    }),
    annotations: {
      title:
        "Generate a Firebase Data Connect Operation on a deployed Firebase Data Connect Schema.",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
      // TODO: Create an endpoint to check for GiF activiation.
    },
  },
  async ({ prompt, service }, { projectId }) => {
    const schema = await generateOperation(prompt, service, projectId!);
    return toContent(schema);
  },
);
