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

- Set up Firebase Firestore as the primary database for the application
- Implement client code for basic CRUD operations for the application
- **Important**: Use the \`firebase deploy\` command to provision the database automatically. **Do not ask developers to go to the console to do it**.
- **Environment**: Use production environment directly - avoid emulator for initial setup
- **Verification**: Guide developers to verify database creation at the [Firebase Console](https://console.firebase.google.com/) by clicking on the "Firestore Database" tab in the left navigation to confirm the database is created.
- **Testing**: Recommend developers test their application and verify data appears correctly in the console. Ask developers to confirm they can see their test data in the console before proceeding to the next step.
- **Security**: Recommend implementing authentication if the application handles sensitive user data. Guide users to navigate to the "Firestore Database" section and click on the "Rules" tab to view and configure their security rules.
- **Security Warning**: Alert developers against making Firestore security rules public (allowing read/write without authentication)
`.trim(),
        },
      ],
    };
  },
);
