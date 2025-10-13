import { resource } from "../../resource";

export const init_backend = resource(
  {
    uri: "firebase://guides/init/backend",
    name: "backend_init_guide",
    title: "Firebase Backend Init Guide",
    description:
      "guides the coding agent through configuring Firebase backend services in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `

1. Determine based on what you already know about the user's project or by asking them which of the following services is appropriate.
2. Use the Firebase \`read_resources\` tool to load the guide to setup the product you choose.

The user will likely need to setup a database solution, Authentication, and Hosting. Read the following guides in order. As you go, add steps from each guide to the FIREBASE_INIT_TODO.md file or using the TODO tool:
 1. [A Firebase database solution](firebase://guides/init/database): read this to choose and set up a database solution.
 2. [Authentication](firebase://guides/init/auth): read this to setup Firebase Authentication to support multi-user apps
 4. [Hosting](firebase://guides/init/hosting): read this if the user would like to deploy to Firebase Hosting

**firebase.json**
The firebase.json file is used to deploy Firebase products with the firebase deploy command.

Here is an example firebase.json file with Firebase Hosting, Firestore, and Cloud Functions. Note that you do not need entries for services that the user isn't using. Do not remove sections from the user's firebase.json unless the user gives explicit permission. For more information, refer to [firebase.json file documentation](https://firebase.google.com/docs/cli/#the_firebasejson_file)
\`\`\`json
{
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  },
  "firestore": {
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
  },
  "functions": {
    "predeploy": [
      "npm --prefix "$RESOURCE_DIR" run lint",
      "npm --prefix "$RESOURCE_DIR" run build"
    ]
  }
}
\`\`\`
`.trim(),
        },
      ],
    };
  },
);
