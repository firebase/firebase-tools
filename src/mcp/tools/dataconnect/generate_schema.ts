import { z } from "zod";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { checkFeatureActive, toContent } from "../../util";
import { generateSchema } from "../../../gemini/fdcExperience";

export const generate_schema = tool(
  {
    name: "generate_schema",
    description:
      "Use this to generate a Firebase Data Connect Schema based on the users description of an app.",
    inputSchema: z.object({
      prompt: z.string().describe("A description of an app that you are interested in building"),
    }),
    annotations: {
      title: "Generate Data Connect Schema",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
      requiresGemini: true,
    },
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("dataconnect", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ prompt }, { projectId }) => {
    const schema = await generateSchema(prompt, projectId);
    return toContent(schema);
  },
);
