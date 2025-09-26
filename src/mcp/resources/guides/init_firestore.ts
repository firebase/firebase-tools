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
- Use the 'firebase_init' tool to set up Firebase Firestore as the primary database for the application
- Run \`firebase deploy\` command to provision the database automatically
- Use production environment directly (avoid emulator for initial setup)

**Code:**
- Use the 'firebase' SDK to read and write to your database.
- You should use the latest modular version of the SDK. Check this by running the command 'npm view firebase' and choosing the latest version
- The Firebase Web SDK can be imported through a package manager or through the CDN.

#### Install via npm
If the user app has a package.json, install via npm
- Run 'npm i firebase'
- Import it into the app code:
'''
import { initializeApp } from 'firebase/app';
'''

#### Install via CDN
If the user app does not have a package.json, import via CDN:
'''
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'
'''

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
