import { resource } from "../../resource";

export const init_firestore = resource(
  {
    uri: "firebase://guides/init/firestore",
    name: "firestore_init_guide",
    title: "Firestore Init Guide",
    description: "guides the coding agent through configuring Firestore in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Setup Firestore Database

**Database Setup:**
- Configure Firebase Firestore as the primary database for the application
- Implement client code for basic CRUD operations using the Firestore SDK
- Run \`firebase deploy --only firestore\` to provision the database automatically
- Use production environment directly (avoid emulator for initial setup)

**Pre-Deployment Security Check:**
- **Important**: Before running \`firebase deploy --only firestore\`, check if the project has open security rules
- If open security rules are detected, show developers the current rule content
- Recommend keeping open rules for a maximum of 24 hours for development purposes only
- Explain that open rules are acceptable for development but must be restricted for production

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
`.trim(),
        },
      ],
    };
  },
);
