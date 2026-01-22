import { resource } from "../../resource";

export const init_rtdb = resource(
  {
    uri: "firebase://guides/init/rtdb",
    name: "rtdb_init_guide",
    title: "Firebase Realtime Database Init Guide",
    description:
      "guides the coding agent through configuring Realtime Database in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
Create a file called \`rtdb.ts\`:

\`\`\`ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const app = initializeApp({...});
const db = getDatabase(app);
\`\`\`
`.trim(),
        },
      ],
    };
  },
);
