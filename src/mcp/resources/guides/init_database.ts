import { resource } from "../../resource";

export const init_database = resource(
  {
    uri: "firebase://guides/init/database",
    name: "database_init_guide",
    title: "Choosing the Right Firebase database product",
    description:
      "guides the coding agent through choosing between Firebase's database products: Firestore, Data Connect, and Realtime Database",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
1. Determine based on what you already know about the user's project or by asking them which of the following services should be used.
2. Use the Firebase \`read_resources\` tool to load the guide to setup the product you choose.

## Available Services

- [Data Connect - PostgreSQL](firebase://guides/init/data-connect): read this if the user needs robust relational querying capabilities or expressly indicates interest in a SQL database
- [Firestore](firebase://guides/init/firestore): read this if the user needs offline data or a mix of querying and realtime capabilities
- [Realtime Database](firebase://guides/init/rtdb): read this if the user is building a "multiplayer" app or game such as a collaborative whiteboard
`.trim(),
        },
      ],
    };
  },
);
