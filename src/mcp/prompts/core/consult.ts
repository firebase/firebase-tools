import { getPlatformFromFolder } from "../../../dataconnect/appFinder";
import { chatWithFirebase } from "../../../gemini/fdcExperience";
import { prompt } from "../../prompt";

export const consult = prompt(
  {
    name: "consult",
    description:
      "Use this command to consult the Firebase Assistant with access to detailed up-to-date documentation for the Firebase platform.",
    arguments: [
      {
        name: "prompt",
        description: "a question to pass to the Gemini in Firebase model",
        required: true,
      },
    ],
    annotations: {
      title: "Consult Firebase Assistant",
    },
  },
  async ({ prompt }, { config, projectId }) => {
    if (!projectId)
      return [
        {
          role: "user" as const,
          content: {
            type: "text",
            text: "Inform the user that this command requires an active project to execute. Use the `firebase_update_environment` tool if the user supplies a project. After setting the project, encourage them to re-run the `firebase:consult` command.",
          },
        },
      ];

    const platform = await getPlatformFromFolder(config.projectDir);

    const gifPrompt = `I am using a coding agent to build with Firebase and I have a specific question that I would like answered. Provide a robust and detailed response that will help the coding agent act on my behalf in a local workspace.

App Platform: ${platform}

Question: ${prompt}`;

    const result = await chatWithFirebase(gifPrompt, projectId);
    const outputString = result.output.messages?.[0].content ?? "";

    return [
      {
        role: "user",
        content: {
          type: "text",
          text: `I have consulted a Firebase Assistant agent with the following question: "${prompt}". Its response was as follows:\n\n${outputString}\n\nPlease use the information above to respond to my question. I have not seen the response from the Firebase Assistant, so please include all necessary information in your response. Inform the user that they must run the \`firebase:consult\` prompt again if they have followup questions for the Firebase Assistant.`,
        },
      },
    ];
  },
);
