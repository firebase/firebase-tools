import { resource } from "../../resource";

export const init_firestore = resource(
  {
    uri: "firebase://guides/init/firestore",
    name: "firestore_init_guide",
    title: "Firestore Init Guide",
    description: "guides the coding agent through configuring Firestore in the current project",
  },
  async (uri) => {
    const date = getTomorrowDate();
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Setup Firestore Database
**Database Setup:**
- Configure Firestore as the application's primary database.
- Implement client-side CRUD using the Firebase SDK.
- Present the app's Firestore data model to the user. Do not confuse Firestore's document model (NoSQL) with Firebase Data Connect's schema.
- Write the default \`firestore.rules\` file (see below) explain what they do, and obtain the user's confirmation before deploying.
- Run \`firebase deploy --only firestore\` to create the database automatically Do not ask the user to create it in the console.
- Use production environment directly (avoid emulator for initial setup)

**Verify and test:**
- Guide the user to open \`https://console.firebase.google.com/u/0/project/{PROJECT_ID}/firestore\` where \`{PROJECT_ID}\` is the project they're currently using (or use \`_\` if project id is unknown) to confirm their database is created.
- Have the user try out the app and confirm that test data appears in the Firestore console.
- Proceed only after the user confirms the database exists and the data is visible in the Firestore console.

**Next Steps:**
- **Authentication**: Recommend implementing Firebase Authentication if the application handles sensitive user data or has open security rules.
- **User Management**: Implement sign-up and sign-in flows to support user-based access control and update security rules accordingly.
- **Security Rules**: Configure user-based security rules based on your application's specific requirements.

### Default \`firestore.rules\` file:

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
