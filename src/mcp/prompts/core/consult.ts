import { detectApps } from "../../../dataconnect/appFinder";
import { chatWithFirebase } from "../../../gemini/fdcExperience";
import { requireGeminiToS } from "../../errors";
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
    const gifTosError = await requireGeminiToS(projectId);
    if (gifTosError) {
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Missing required conditions to run this prompt:\n\n${gifTosError.content[0]?.text}\n\nPlease ask the user if they would like to accept this terms of service before proceeding. If they do not accept, do not proceed.`,
          },
        },
      ];
    }

    const apps = await detectApps(config.projectDir);
    const platforms = apps.map((a) => a.platform);

    const gifPrompt = `I am using a coding agent to build with Firebase and I have a specific question that I would like answered. Provide a robust and detailed response that will help the coding agent act on my behalf in a local workspace.

App Platform(s): ${platforms.join(", ")}

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
