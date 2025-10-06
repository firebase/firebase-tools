import { getPlatformFromFolder } from "../../../dataconnect/appFinder";
import { Platform } from "../../../dataconnect/types";
import { prompt } from "../../prompt";

export const init = prompt(
  {
    name: "init",
    description: "Use this command to set up Firebase services, like backend and AI features.",
    annotations: {
      title: "Initialize Firebase",
    },
  },
  async (_, mcp) => {
    const { config, projectId, accountEmail } = mcp;

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


## Steps

Follow the steps below taking note of any user instructions provided above.

1. If there is no active user, use the \`firebase_login\` tool to help them sign in.
   - If you run into issues logging the user in, suggest that they run \`npx firebase-tools login --reauth\` in a separate terminal
2.1 Start by listing out the existing init options that are available to the user. Ask the user which set of services they would like to add to their app. Always enumerate them and list the options out explicitly for the user.
  1. Backend Services: Backend services for the app, such as setting up a database, adding a user-authentication sign up and login page, and deploying a web app to a production URL.
    - IMPORTANT: The backend setup guide is for web apps only. If the user requests backend setup for a mobile app (iOS, Android, or Flutter), inform them that this is not supported and do not use the backend setup guide. You can still assist with other requests.
  2. Firebase AI Logic: Add AI features such as chat experiences, multimodal prompts, image generation and editing (via nano banana), etc.
    - IMPORTANT: The Firebase AI Logic setup guide is for web, flutter, and android apps only. If the user requests firebase setup for unsupported platforms (iOS, Unity, or anything else), inform them that this is not supported and direct the user to Firebase Docs to learn how to set up AI Logic for their application (share this link with the user https://firebase.google.com/docs/ai-logic/get-started?api=dev). You can still assist with other requests.
3. After the user chooses an init option, create a plan based on the remaining steps in this guide, share it with the user, and give them an opportunity to accept or adjust it.
4. If there is no active Firebase project, ask the user if they would like to create a project, or use an existing one, and ask them for the project ID
   - If they would like to create a project, use the firebase_create_project with the project ID
   - If they would like to use an existing project, use the firebase_update_environment tool with the active_project argument.
   - If you run into issues creating the firebase project, ask the user to go to the [Firebase Console](http://console.firebase.google.com/) and create a project. Wait for the user to report back before continuing.
5. Ensure there is an active Firebase App for their platform
   - Do the following only for Web and Android apps
     - Run the \`firebase_list_apps\` tool to list their apps, and find an app that matches their "Workspace platform"
     - If there is no app that matches that criteria, use the \`firebase_create_app\` tool to create the app with the appropriate platform
   - Do the following only for Flutter apps
     - Execute \`firebase --version\`  to check if the Firebase CLI is installed
       - If it isn't installed, run \`npm install -g firebase-tools\` to install it. If it is installed, skip to the next step. 
     - Install the Flutterfire CLI
     - Use the Flutterfire CLI tool to connect to the project
     - Use the Flutterfire CLI to register the appropriate applications based on the user's input
       - Let the developer know that you currently only support configuring web, ios, and android targets together in a bundle. Each of those targets will have appropriate apps registered in the project using the flutterfire CLI
       - Execute flutterfire config using the following pattern: flutterfire config --yes --project=<aliasOrProjectId> --platforms=<platforms>
6. Now that we have a working environment, print out 1) Active user 2) Firebase Project and 3) Firebase App & platform they are using for this process.
   - Ask the user to confirm this is correct before continuing
7. Set up the web Firebase SDK. Skip straight to #8 for Flutter and Android apps
  - Fetch the configuration for the specified app using the \`firebase_get_sdk_config\` tool.
  - Write the Firebase SDK config to a file
  - Check what the latest version of the SDK is by running the command 'npm view firebase version'
  -  If the user app has a package.json, install via npm
    - Run 'npm i firebase'
    - Import it into the app code:
    '''
    import { initializeApp } from 'firebase/app';
    '''
  - If the user app does not have a package.json, import via CDN:
    '''
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'
    '''
8. Read the guide for the appropriate services and follow the instructions. If no guides match the user's need, inform the user.
- Use the Firebase \`read_resources\` tool to load the instructions for the service the developer chose in step 2 of this guide
  - [Backend Services](firebase://guides/init/backend): Read this resource to set up backend services for the app, such as setting up a database, adding a user-authentication sign up and login page, and deploying a web app to a production URL.
  - [Firebase AI Logic](firebase://guides/init/ai): Read this resource to add Gemini-powered AI features such as chat experiences, multimodal prompts, image generation, image editing (via nano banana), etc.
`.trim(),
        },
      },
    ];
  },
);
