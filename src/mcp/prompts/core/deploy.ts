import { prompt } from "../../prompt";

export const deploy = prompt(
  {
    name: "deploy",
    omitPrefix: true,
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

1. If there is no active user, prompt the user to run \`firebase login\` in an interactive terminal before continuing.
2. If there is no \`firebase.json\` file and the current workspace is a static web application, manually create a \`firebase.json\` with \`"hosting"\` configuration based on the current directory's web app configuration. Add a \`{"hosting": {"predeploy": "<build_script>"}}\` config to build before deploying.
3. If there is no active project, ask the user if they want to use an existing project or create a new one.
  3a. If create a new one, use the \`firebase_create_project\` tool.
  3b. If they want to use an existing one, ask them for a project id (the \`firebase_list_projects\` tool may be helpful).
4. Only after making sure Firebase has been initialized, run the \`firebase deploy\` shell command to perform the deploy. This may take a few minutes.
5. If the deploy has errors, attempt to fix them and ask the user clarifying questions as needed.
6. If the deploy needs \`--force\` to run successfully, ALWAYS prompt the user before running \`firebase deploy --force\`.
7. If only one specific feature is failing, use command \`firebase deploy --only <feature>\` as you debug.
`.trim(),
        },
      },
    ];
  },
);
