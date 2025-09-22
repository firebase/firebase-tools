import { getPlatformFromFolder } from "../../../dataconnect/appFinder";
import { Platform } from "../../../dataconnect/types";
import { prompt } from "../../prompt";

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
  async ({ prompt }, { config, projectId, accountEmail }) => {
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

1. If there is no active user, use the \`firebase_login\` tool to help them sign in.
2. Determine which of the services listed below are the best match for the user's needs based on their instructions or by asking them.
3. Read the guide for the appropriate services and follow the instructions. If no guides match the user's need, inform the user.

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
