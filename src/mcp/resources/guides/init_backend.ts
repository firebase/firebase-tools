import { resource } from "../../resource";

export const init_backend = resource(
  {
    uri: "firebase://guides/init/backend",
    name: "backend_init_guide",
    title: "Firebase Backend Init Guide",
    description:
      "guides the coding agent through configuring Firebase backend services in the current project",
  },
  async (uri, ctx) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `

1. Determine based on what you already know about the user's project or by asking them which of the following services is appropriate.
2. Use the Firebase \`read_resources\` tool to load the guide to setup the product you choose.

The user will likely need to setup Firestore, and Authentication. Read the following guides in order:
 1. [Firestore](firebase://guides/init/firestore): read this to setup Firestore database
 2. [Authentication](firebase://guides/init/auth): read this to setup Firebase Authentication to support multi-user apps
 3. [Firestore Rules](firebase://guides/init/firestore_rules): read this to setup the \`firestore.rules\` file for securing your database

Once you are done setting up backend services, ask the user if they would like to deploy the backend configuration (such as Firestore rules and indexes).
If they say yes, run the Firebase CLI command '${ctx.firebaseCliCommand} deploy --non-interactive' to deploy these backend services.

# Next Steps: Deploying the Web Application
After the backend is configured, recommend that the user deploy their web application to a public hosting URL.

**IMPORTANT**: To deploy the web application, you MUST use the Firebase MCP Server's **deploy prompt**, NOT the CLI deploy command.

To invoke the deploy prompt:
- Call the \`firebase_deploy\` prompt tool (if available in your MCP tools)
- Or guide the user to run: \`/firebase:deploy\` in their chat interface

The deploy prompt will automatically:
1. Analyze the web application to determine if it needs Server-Side Rendering (SSR)
2. Configure Firebase App Hosting (for SSR apps) or Firebase Hosting (for static apps)
3. Deploy the application files to Firebase

**DO NOT** run \`${ctx.firebaseCliCommand} deploy\` for deploying the web application - that command was already used above for deploying backend configuration only (Firestore rules, indexes, etc.).

\`\`\`
`.trim(),
        },
      ],
    };
  },
);
