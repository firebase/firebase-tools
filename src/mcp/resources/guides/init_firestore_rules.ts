import { resource } from "../../resource";

export const init_firestore_rules = resource(
  {
    uri: "firebase://guides/init/firestore_rules",
    name: "firestore_rules_init_guide",
    title: "Firestore Rules Init Guide",
    description:
      "guides the coding agent through setting up Firestore security rules in the project",
  },
  async (uri, { config }) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
# Firestore Rules
This guide walks you through updating the Firestore security rules and deploying them to ensure only authenticated users can access their own data.

Contents of the user's current \`firestore.rules\` file:

\`\`\`
${config.readProjectFile("firestore.rules", { fallback: "<FILE DOES NOT EXIST>" })}
\`\`\`

1. Create the personalData and publicData security rules (seen below). If they have existing \`firestore.rules\`, integrate these with the user's existing rules.
2. Validate & fix the security rules using the \`validate_rules\` tool. Only continue to the next step when the \`validate_rules\` tool succeeds
3. Update queries in the user's app to use the updated security rules
4. Print the contents of the \`firestore.rules\` file. Ask the user for permission to deploy the rules. Do not continue until the user confirms. Deploy the security rules using \`firebase deploy --only firestore\` in the terminal. Do not tell the user to go to the console to deploy rules as this command will do it automatically.

For database entities that neatly fall into the "personal" and "public categories, you can use the personalData and publicData rules. Use the following firestore.rules file, and add a comment above 'personalData' and 'publicData' to note what entities apply to each rule.

\`\`\`
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /personalData/{appId}/users/{uid}/{collectionName}/{docId} {
      allow get: if uid == request.auth.uid;
      allow list: if uid == request.auth.uid && request.query.limit <= 100;
      allow write: if uid == request.auth.uid;
    }

    match /publicData/{appId}/{collectionName}/{docId} {
      allow get: if true;
      allow list: request.query.limit <= 100;
      allow write: if true;
    }
  }
}
\`\`\`
`.trim(),
        },
      ],
    };
  },
);
