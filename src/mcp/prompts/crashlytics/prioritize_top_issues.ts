import { prompt } from "../../prompt";

export const prioritize_issues = prompt(
  {
    name: "prioritize_issues",
    omitPrefix: true,
    description: "Fetch and prioritize issues from Crashlytics.",
    arguments: [
      {
        name: "prompt",
        description: "Any additional instructions you wish to provide about issue prioritization.",
        required: false,
      },
    ],
    annotations: {
      title: "Prioritize Crashlytics Issues",
    },
  },
  async ({ prompt }, { config, projectId, accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to prioritize issues from Crashlytics to return the top 5 issues based on the criteria below.

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
2. If there is no active project, ask the user if they want to use the project id from the \`firebase.json\` file or provide a different project id.
  2a. If there is no \`firebase.json\` file, then just ask the user to provide a project id.
3. If there is no active app id, ask the user if they want to use the app id from the \`firebase.json\` file or provide a different app id.
  3a. If there is no \`firebase.json\` file, then just ask the user to provide an app id.
4. Use the \`crashlytics_list_top_issues\` tool to fetch up to 20 issues.
5. If the user instructions include statements about prioritization, use those instructions.
6. If the user instructions do not include statements about prioritization, then prioritize the returned issues using the following criteria:
  6a. The app versions include the most recent version of the app. Determine this by looking at the versions across all retrieved issues and picking the most recent one by semantic version.
  7b. The number of users experiencing the issue
  8c. The volume of crashes
6. Return the top 3 issue ids, with a brief description of the issue in the following format: 
   Issue <issue id>: <issue description>

The point of this command is to surface information but not solve the issues.
`.trim(),
        },
      },
    ];
  },
);
