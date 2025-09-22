import { resource } from "../../resource";

export const init_backend = resource(
  {
    uri: "firebase://guides/init/backend",
    name: "backend_init_guide",
    title: "Firebase Backend Init Guide",
    description:
      "guides the coding agent through configuring Firebase backend services in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
1. Determine based on what you already know about the user's project or by asking them which of the following services is appropriate.
2. Use the Firebase \`read_resources\` tool to load the guide to setup the product you choose.

## Available Services

- [Firestore](firebase://guides/init/firestore): read this if the user needs offline data or a mix of querying and realtime capabilities
- [Realtime Database](firebase://guides/init/rtdb): read this if the user is building a "multiplayer" app or game such as a collaborative whiteboard
- [Data Connect - PostgreSQL](firebase://guides/init/data-connect): read this if the user needs robust relational querying capabilities or expressly indicates interest in a SQL database
`.trim(),
        },
      ],
    };
  },
);
