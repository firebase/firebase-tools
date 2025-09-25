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
- Set up Firebase Firestore as the primary database for the application
- Implement client code for basic CRUD operations using Firestore SDK
- Run \`firebase deploy\` command to provision the database automatically
- Use production environment directly (avoid emulator for initial setup)

**Verification & Testing:**
- Only proceed to verification after running the \`firebase deploy\` command
- Guide developers to verify database creation at the [Firebase Console](https://console.firebase.google.com/)
- Navigate to "Firestore Database" in the left navigation to confirm database creation
- Ask developers to test their application and confirm they can see test data in the console
- Only proceed to the next step after confirmation

**Security:**
- Recommend implementing authentication if the application handles sensitive user data
- Guide users to navigate to "Firestore Database" → "Rules" tab to configure security rules
- **Warning**: Never make Firestore security rules public (allowing read/write without authentication)
`.trim(),
        },
      ],
    };
  },
);
