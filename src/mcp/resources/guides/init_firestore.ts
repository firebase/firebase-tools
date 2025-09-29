import { resource } from "../../resource";

export const init_firestore = resource(
  {
    uri: "firebase://guides/init/firestore",
    name: "firestore_init_guide",
    title: "Firestore Init Guide",
    description: "guides the coding agent through configuring Firestore in the current project",
  },
  async (uri, { projectId }) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Setup Firestore Database
This guide walks you through setting up the user's Firestore database.

Important: do not use the Firestore emulator. You are setting up Firestore against prod resources.

1. Provision the Firestore service for the user by running \`firebase deploy --only firestore\` in the terminal. This will ensure Firestore is setup
2. Come up with a list of database entities for the app. Do not write them to a file just print them out for the user.
 - Think of only "persistent" entities that must persist over reloads of the app.
 - For each entity, determine if it is "personal" data or "public", and note it beside the entity name.
   - "personal" - only be read / written to by the current user
   - "public" - can be read / written to by anyone
3. Add Firestore initialization code
4. Setup security rules
 - Use the Firebase \`read_resources\` tool to load the [Firestore Rules](firebase://guides/init/firestore_rules) resource. Once that is complete, continue to the next step.
5. For each database entity you came up with, add code to synchronize and update database entities in Firestore
 - Keep in mind what security rule path to use for each entity, and ensure the code to fetch, update, and list matches
6. Ask the user to visit \`https://console.firebase.google.com/u/0/project/${projectId || "_"}/firestore\` to view their Firestore database and inspect their Firestore rules. In addition, have the user test their app to ensure that the functionality works. Only proceed to the next step after confirming successful database setup and data visibility.
7. Continue to the next step in the setup
`.trim(),
        },
      ],
    };
  },
);
