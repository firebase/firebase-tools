import { prompt } from "../../prompt";

export const deploy = prompt(
  {
    name: "deploy",
    description: "Use this command to deploy resources to Firebase.",
    arguments: [
      {
        name: "prompt",
        description: "any specific instructions you wish to provide about deploying",
        required: false,
      },
    ],
    annotations: {
      title: "Deploy to Firebase",
    },
  },
  async ({ prompt }, { config, projectId, accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to deploy resources from the current project to Firebase.

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

1. If there is no active user, prompt the user to run \`npx firebase@latest login\` in an interactive terminal before continuing.
2. Analyze the source code in the current working directory to determine if this is a web app. If it isn't, end this process and tell the user "The /firebase:deploy command only works with web apps."
3. Analyze the source code in the current working directory to determine if the app requires a server for Server-Side Rendering (SSR). This will determine whether or not to use Firebase App Hosting. Here are instructions to determine if the app needs a server:
  Objective: Analyze the provided codebase files to determine if the web application requires a backend for Server-Side Rendering (SSR). Your final output must be a clear "Yes" or "No" followed by a brief justification.
  Primary Analysis: package.json
    This is the most critical step. If the package.json file is present, perform the following checks in order.
    Parse package.json: Locate and read the contents of the package.json file.
      Check Dependencies:
        Examine the dependencies and devDependencies objects.
        If any of the following packages are listed as keys, you can conclude the app uses SSR.
          next
          nuxt
          @sveltejs/kit
          @angular/ssr
          remix
        If a match is found, proceed directly to the Final Determination step.
      Check Scripts: If no framework dependency was found, examine the scripts object.
        Look for scripts (commonly start or serve) that execute a server process.
        Examples include: "start": "next start", "start": "nuxt start", or "dev": "ng serve --ssr".
        If such a script is found, conclude the app uses SSR and proceed to the Final Determination step.
  Secondary Analysis: Project File Structure
    Perform this analysis only if package.json is missing or inconclusive.
    Scan for Framework-Specific Files and Directories: Search the codebase for the following patterns:
      Next.js: A directory named app/ or pages/. Inside these, check for files containing the function name getServerSideProps.
      Nuxt.js: A directory named server/.
      SvelteKit: Any file ending with the .server.js suffix (e.g., +page.server.js, +layout.server.js).
      Angular: A file named server.ts.
    If any of these patterns are found, conclude the app uses SSR.
  Final Determination
    State Your Conclusion: Begin your response with a definitive "Yes" or "No".
      Yes: The application requires a backend for SSR.
      No: The application does not appear to require a backend for SSR and is likely a static or client-side rendered app.
    Provide Justification: Follow your conclusion with a single sentence explaining the evidence.
      Example (Yes): "Yes, the project requires SSR, as evidenced by the next dependency in package.json."
      Example (Yes): "Yes, the project requires SSR, as evidenced by the presence of a +page.server.js file."
      Example (No): "No, there are no dependencies or file structures that indicate the use of a server-side rendering framework."
4. If there is no \`firebase.json\` file, manually create one based on whether the app requires SSR:
  4a. If the app requires SSR, configure Firebase App Hosting:
     Create \`firebase.json\ with an "apphosting" configuration, setting backendId to the app's name in package.json: \`{"apphosting": {"backendId": "<backendId>"}}\
  4b. If the app does NOT require SSR, configure Firebase Hosting:
    Create \`firebase.json\ with a "hosting" configuration. Add a \`{"hosting": {"predeploy": "<build_script>"}}\` config to build before deploying.
5. Check if there is an active Firebase project for this environment (the \`firebase_get_environment\` tool may be helpful). If there is, provide the active project ID to the user and ask them if they want to proceed using that project. If there is not an active project, give the user two options: Provide an existing project ID or create a new project. Only use the list_projects tool on user request. Wait for their response before proceeding.
  5a. If the user chooses to use an existing Firebase project, the \`firebase_list_projects\` tool may be helpful. Set the selected project as the active project (the \`firebase_update_environment\` tool may be helpful).
  5b. If the user chooses to create a new project, use the \`firebase_create_project	\` tool. Then set the new project as the active project (the \`firebase_update_environment\` tool may be helpful).
6. If firebase.json contains an "apphosting" configuration, check if a backend exists matching the provided backendId (the \`apphosting_list_backends\` tool may be helpful).
   If it doesn't exist, create one by running the \`npx firebase@latest apphosting:backends:create --backend <backendId> --primary-region us-central1 --root-dir .\` shell.
7. Only after making sure Firebase has been initialized, run the \`npx firebase@latest deploy\` shell command to perform the deploy. This may take a few minutes.
  7a. If deploying to apphosting, tell the user the deployment will take a few minutes, and they can monitor deployment progress in the Firebase console: \`https://console.firebase.google.com/project/<projectId>/apphosting\`
8. If the deploy has errors, attempt to fix them and ask the user clarifying questions as needed.
9. If the deploy needs \`--force\` to run successfully, ALWAYS prompt the user before running \`npx firebase@latest deploy --force\`.
10. If only one specific feature is failing, use command \`npx firebase@latest deploy --only <feature>\` as you debug.
11. If the deploy succeeds, your job is finished.
`.trim(),
        },
      },
    ];
  },
);
