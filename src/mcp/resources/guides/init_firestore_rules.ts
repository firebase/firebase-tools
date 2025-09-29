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
    const date = getTomorrowDate();
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
# Firestore Rules
This guide walks you through creating and editing the user's firestore.rules file.

Contents of the user's current \`firestore.rules\` file:

\`\`\`
${config.readProjectFile("firestore.rules", { fallback: "<FILE DOES NOT EXIST>" })}
\`\`\`

1. Ask the user for how they would like their security rules implemented. Do not continue until the user confirms the option. If they have existing security rules that match one of these options, do not ask them, and go with the matching option. These options will determine how to write the user's \`firestore.rules\` file.
 - Option 1: Development security rules (rules will be open until tomorrow)
 - Option 2: Simple "personal" and "public" rules
 - Option 3: Custom security rules
2. Validate & fix the security rules using the \`validate_rules\` tool. Only continue to the next step when the \`validate_rules\` tool succeeds
3. Print the contents of the \`firestore.rules\` file. Ask the user for permission to deploy the rules. Do not continue until the user confirms. Deploy the security rules using \`firebase deploy --only firestore\` in the terminal.

### Option 1: Development security rules
Write the following security rules into the user's \`firestore.rules\` file. Note that these rules are acceptable for development, but that further work is needed to secure their Firestore database.

\`\`\`
// Allow reads and writes to all documents for authenticated users.
// This rule will only be valid until tomorrow.
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null && request.time < timestamp.date(${date.year}, ${date.month}, ${date.day});
    }
  }
}
\`\`\`

### Option 2: Simple "personal" and "public" rules
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

### Option 3: Custom security rules
For more complicated rules, the user can implement their own custom security rules.

1. Please list all of the database entities (without their public / private groupings). Ask the user how they would like to apply rules to each of those entities. Please clarify that the user must ensure that their application is secure.
2. Come up with a set of security rules given their description.
3. Repeat until the user believes their rules are acceptable and secure.
`.trim(),
        },
      ],
    };
  },
);

function getTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Month is 0-indexed, so add 1
  return { year: tomorrow.getFullYear(), month: tomorrow.getMonth() + 1, day: tomorrow.getDate() };
}
