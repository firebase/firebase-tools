import { getDefaultHostingSite } from "../../../getDefaultHostingSite";
import { resource } from "../../resource";

export const init_hosting = resource(
  {
    uri: "firebase://guides/init/hosting",
    name: "hosting_init_guide",
    title: "Firebase Hosting Deployment Guide",
    description:
      "guides the coding agent through deploying to Firebase Hosting in the current project",
  },
  async (uri, ctx) => {
    const defaultHostingSite = await getDefaultHostingSite(ctx);
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Configure Firebase Hosting
Default hosting site for ${ctx.projectId}: ${defaultHostingSite || "Does not exist"}
If there is not default hosting site configure, ask the user what the site ID should be, and suggest ${ctx.projectId} as a good choice.
Next, use the 'firebase_init' tool to set up hosting. Below is an example of what the arguments to do so look like;
however, you should change the values to match the user's choices and project structure:
{
  features: {
    hosting: {
      site_id: ${ctx.projectId},
      public_directory: public,
    }
  }
}

**Security Warning:**
- Files included in the public folder of a hosting site are publicly accessible. Do not include sensitive API keys for services other than Firebase in these files.
`.trim(),
        },
      ],
    };
  },
);
