import { resource } from "../../resource";

export const init_ai = resource(
  {
    uri: "firebase://guides/init/ai",
    name: "ai_init_guide",
    title: "Firebase GenAI Init Guide",
    description:
      "guides the coding agent through configuring GenAI capabilities in the current project utilizing Firebase",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `Create ai.ts with import { AI } from "firebase";`,
        },
      ],
    };
  },
);
