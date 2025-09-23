import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { chatWithFirebase } from "../../../gemini/fdcExperience";

export const consult_assistant = tool(
  {
    name: "consult_assistant",
    description:
      "Access an AI assistant specialized in all aspects of **Firebase**. " +
      "Use this tool to get **detailed information**, **best practices**, **troubleshooting steps**, **code examples**, and **contextual help** regarding Firebase services, features, and project configuration. " +
      "This includes questions about Firestore, Authentication, Cloud Functions, Hosting, Storage, Analytics, and more. " +
      "It can also provide insights based on the **current Firebase project context**.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "The specific question or task related to Firebase. " +
            "Be precise and include relevant details, such as the Firebase service in question, the desired outcome, or any error messages encountered. " +
            "Examples:  'What's the best way to deploy a React app to Firebase Hosting?', 'Explain Firebase Authentication with Google Sign-In.' , 'What are the current project settings for 'projectId'? ",
        ),
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
