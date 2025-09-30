import { resource } from "../../resource";

export const init_firestore = resource(
  {
    uri: "firebase://guides/init/firestore",
    name: "firestore_init_guide",
    title: "Firestore Init Guide",
    description: "guides the coding agent through configuring Firestore in the current project",
  },
<<<<<<< HEAD
  async (uri) => {
    const date = getTomorrowDate();
=======
  async (uri, {projectId}) => {
>>>>>>> 003e536ef (rebase)
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Setup Firestore Database
<<<<<<< HEAD
**Database Setup:**
- Configure Firebase Firestore as the primary database for the application
- Implement client code for basic CRUD operations using the Firestore SDK
- Write the default \`firestore.rules\` file (see below)
- Run \`firebase deploy --only firestore\` to provision the database automatically
- Use production environment directly (avoid emulator for initial setup)
=======
This guide walks you through setting up the user's Firestore database.
>>>>>>> 003e536ef (rebase)

A few notes on this setup process:
 - Do not use the Firestore emulator
 - Determine if the user setup Firebase Authentication. If they did, you can use their

<<<<<<< HEAD
**Deployment:**
- Run \`firebase deploy --only firestore\` to provision the database automatically

**Verification & Testing:**
- Only proceed with verification after successfully running \`firebase deploy --only firestore\`
- Guide the user to visit \`https://console.firebase.google.com/u/0/project/{PROJECT_ID}/firestore\` where \`{PROJECT_ID}\` is the project they're currently using (or use \`_\` if project id is unknown).
- Have developers test their application functionality and verify test data appears in the console
- Only proceed to the next step after confirming successful database setup and data visibility

**Security Configuration:**
- Guide users to navigate to "Firestore Database" → "Rules" tab to configure security rules
- **Critical Warning**: Never make Firestore security rules public (allowing read/write without authentication)
- Ensure security rules are properly configured and tested before moving to production

**Next Steps:**
- **Authentication**: Recommend implementing Firebase Authentication if the application handles sensitive user data or has open security rules
- **User Management**: Implement user sign-up and login features with Firebase Authentication to establish proper data validation and access controls
- **Security Rules**: Configure user-based security rules based on your application's specific requirements

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
=======
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
6. Ask the user to visit \`https://console.firebase.google.com/u/0/project/${projectId || '_'}/firestore\` to view their Firestore database and inspect their Firestore rules. In addition, have the user test their app to ensure that the functionality works. Only proceed to the next step after confirming successful database setup and data visibility.
7. Continue to the next step in the setup
>>>>>>> 003e536ef (rebase)
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
