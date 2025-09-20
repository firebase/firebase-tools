import { resource } from "../../resource";

export const init_data_connect = resource(
  {
    uri: "firebase://guides/init/data_connect",
    name: "data_connect_init_guide",
    title: "Firebase Data Connect Init Guide",
    description:
      "guides the coding agent through configuring Data Connect for PostgreSQL access in the current project",
  },
  async (uri, ctx) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
Create a file called \`data-connect.ts\`:

\`\`\`ts
import { initializeApp } from "firebase/app";
import { getDataConnect } from "firebase/data-connect";

const app = initializeApp({...});
const db = getDataConnect(app);
\`\`\`
`.trim(),
        },
      ],
    };
  },
);
