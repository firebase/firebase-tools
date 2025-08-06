import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { chatWithFirebase } from "../../../gemini/fdcExperience";

export const consult_assistant = tool(
  {
    name: "consult_assistant",
    description:
      "Send a question to an AI assistant specifically enhanced to answer Firebase questions.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("A description of what the user is trying to do or learn with Firebase."),
    }),
    annotations: {
      title: "Consult Firebase Assistant",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
      requiresGemini: true,
    },
  },
  async ({ prompt }, { projectId }) => {
    const schema = await chatWithFirebase(prompt, projectId);
    return toContent(schema);
  },
);
