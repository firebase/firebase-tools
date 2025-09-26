import { getPlatformFromFolder } from "../../../dataconnect/appFinder";
import { Platform } from "../../../dataconnect/types";
import { prompt } from "../../prompt";
import { init_ai } from "../../resources/guides/init_ai";
import { init_backend } from "../../resources/guides/init_backend";
import { ServerResource } from "../../resource";

const GUIDE_PARAMS: Record<string, ServerResource> = {
  "ai-logic": init_ai,
  backend: init_backend,
};

export const init = prompt(
  {
    name: "init",
    description: "Use this command to setup Firebase for the current workspace.",
    arguments: [
      {
        name: "prompt",
        description: "any Firebase products you want to use or the problems you're trying to solve",
        required: false,
      },
    ],
    annotations: {
      title: "Initialize Firebase",
    },
  },
  async ({ prompt }, mcp) => {
    const { config, projectId, accountEmail } = mcp;

    // This allows a "short circuit" feature where you can pass a specific
    // name, like "ai-logic" into the prompt and get a specific guide
    const resourceDefinition = prompt ? GUIDE_PARAMS[prompt] : undefined;
    if (resourceDefinition) {
      const resource = await resourceDefinition.fn(resourceDefinition.mcp.uri, mcp);
      return resource.contents
        .filter((resContents) => !!resContents.text)
        .map((resContents) => ({
          role: "user" as const,
          content: {
            type: "text",
            text: String(resContents.text),
          },
        }));
    }

    const platform = await getPlatformFromFolder(config.projectDir);

    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to help the user setup Firebase services in this workspace. Firebase is a large platform with many potential uses, so you will:

1. Detect which Firebase services are already in use in the workspace, if any
2. Determine which new Firebase services will help the user build their app
3. Provision and configure the services requested by the user

## Workspace Info

Use this information to determine which Firebase services the user is already using (if any).

Workspace platform: ${[Platform.NONE, Platform.MULTIPLE].includes(platform) ? "<UNABLE TO DETECT>" : platform}
Active user: ${accountEmail || "<NONE>"}
Active project: ${projectId || "<NONE>"}

Contents of \`firebase.json\` config file:

\`\`\`json
${config.readProjectFile("firebase.json", { fallback: "<FILE DOES NOT EXIST>" })}
\`\`\`

## User Instructions

${prompt || "<the user didn't supply specific instructions>"}

## Steps

Follow the steps below taking note of any user instructions provided above.

IMPORTANT: The backend setup guide is for web apps only. If the user requests backend setup for a mobile app (iOS, Android, or Flutter), inform them that this is not supported and do not use the backend setup guide. You can still assist with other requests.

1. If there is no active user, use the \`firebase_login\` tool to help them sign in.
   - If you run into issues logging the user in, suggest that they run \`npx firebase-tools login --reauth\` in a separate terminal
2. If there is no active Firebase project, ask the user if they would like to create a project, or use an existing one, and ask them for the project ID
   - If they would like to create a project, use the firebase_create_project with the project ID
   - If they would like to use an existing project, run the shell command \`firebase use <project-id>\`
   - If you run into issues creating the firebase project, ask the user to go to the [Firebase Console](http://console.firebase.google.com/) and create a project. Wait for the user to report back before continuing.
3. Ensure there is an active Firebase App for their platform
   - Run the \`firebase_list_apps\` tool to list their apps, and find an app that matches their "Workspace platform"
   - If there is not app that matches that criteria, use the \`firebase_create_app\` tool to create the app with the appropriate platform
4. Now that we have a working environment, print out 1) Active user 2) Firebase Project and 3) Firebase App & platform they are using for this process.
   - Ask the user to confirm this is correct before continuing
5. Initialize the Firebase SDK
  - Fetch the configuration for the specified app using the \`firebase_get_sdk_config\` tool.
  - Write the Firebase SDK config to a file
  - Initialize the Firebase SDK for the appropriate platform
6. Determine which of the services listed below are the best match for the user's needs based on their instructions or by asking them.
7. Read the guide for the appropriate services and follow the instructions. If no guides match the user's need, inform the user.

## Available Services

The following Firebase services are available to be configured. Use the Firebase \`read_resources\` tool to load their instructions for further guidance.

- [Backend Services](firebase://guides/init/backend): Read this resource to setup backend services for the user such as user authentication, database, or cloud file storage.
- [GenAI Services](firebase://guides/init/ai): Read this resource to setup GenAI services for the user such as building agents, LLM usage, unstructured data analysis, image editing, video generation, etc.

UNAVAILABLE SERVICES: Analytics, Remote Config (feature flagging), A/B testing, Crashlytics (crash reporting), and Cloud Messaging (push notifications) are not yet available for setup via this command.
`.trim(),
        },
      },
    ];
  },
);
