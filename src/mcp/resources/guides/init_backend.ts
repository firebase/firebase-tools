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

Determine based on what you already know about the user's project or by asking them which of the following services is appropriate.
Then, use the Firebase \`read_resources\` tool to load the guide to setup the products you choose.

The user will likely need to setup a database solution, Authentication, and Hosting. Read the following guides in order.

1. [Hosting](firebase://guides/init/hosting): read this if the user would like to use Firebase Hosting for their web app.
2. [A Firebase database solution](firebase://guides/init/database): read this to choose and set up a database solution.
3. [Authentication](firebase://guides/init/auth): read this to setup Firebase Authentication to support multi-user apps

Once you've set up these services, ask the user if they would like to deploy their site. If they say yes, run the command 'firebase deploy --force' to do so.
`.trim(),
        },
      ],
    };
  },
);
