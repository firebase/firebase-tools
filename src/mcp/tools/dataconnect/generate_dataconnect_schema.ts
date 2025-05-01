import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { generateSchema } from "../../../gif/fdcExperience.js";

export const generate_dataconnect_schema = tool(
  {
    name: "generate_dataconnect_schema",
    description:
      "Generates a Firebase Data Connect Schema based on the users description of an app.",
    inputSchema: z.object({
      prompt: z.string().describe("A description of an app that you are interested in building"),
    }),
    annotations: {
      title: "Generate a Firebase Data Connect Schema for a new Firebase project.",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
      // TODO: Create an endpoint to check for GiF activiation.
    },
  },
  async ({ prompt }, { projectId }) => {
    const schema = await generateSchema(prompt, projectId!);
    return toContent(schema);
  },
);
