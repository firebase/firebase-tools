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

- If one does not already exist, create a public directory for the site. This is where the files for the site go. 
  If user project has a build step, this should be the output directory for that step.
- Add a 'hosting' block to firebase.json. The following is an example, but you should change the specific values to match the users directory structure.
\`\`\`
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  },
\`\`\`
**Security Warning:**
- Files included in the public folder of a hosting site are publicly accessible. Do not include sensitive API keys for services other than Firebase in these files.
`.trim(),
        },
      ],
    };
  },
);
