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

The user will likely need to setup Firestore, Authentication. Read the following guides in order:
 1. [Firestore](firebase://guides/init/firestore): read this to setup Firestore database
 2. [Authentication](firebase://guides/init/auth): read this to setup Firebase Authentication to support multi-user apps
 3. [Firestore Rules](firebase://guides/init/firestore_rules): read this to setup the \`firestore.rules\` file for securing your database

Once you are done setting up, ask the user if they would like to deploy.
If they say yes, run the command '${ctx.firebaseCliCommand} deploy --non-interactive' to do so.

# Next Steps
The next step is to recommend users to use the deploy prompt to deploy their app.
\`\`\`
`.trim(),
        },
      ],
    };
  },
);
