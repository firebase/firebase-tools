import { resource } from "../../resource";

export const init_hosting = resource(
  {
    uri: "firebase://guides/init/hosting",
    name: "hosting_init_guide",
    title: "Firebase Hosting Deployment Guide",
    description:
      "guides the coding agent through deploying to Firebase Hosting in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Configure Firebase Hosting

**When to Deploy:**
- Introduce Firebase Hosting when developers are ready to deploy their application to production
- Alternative: Developers can deploy later using the \`/firebase:deploy\` command

**Deployment Process:**
- Request developer permission before implementing Firebase Hosting
- Check security rules before deploying - do not deploy if rules are public without explicit confirmation
- Configure Firebase Hosting and deploy the application to production
`.trim(),
        },
      ],
    };
  },
);
