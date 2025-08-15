import { prompt } from "../../prompt";

export const prioritize_issues = prompt(
  {
    name: "prioritize_issues",
    omitPrefix: false,
    description: "Fetch and prioritize issues from Crashlytics.",
    arguments: [
      {
        name: "project_id",
        description: "ProjectId for which the versions list should be fetched. For an Android application, read the project_id value specified in the google-services.json file for the current package name. For an iOS Application, read the PROJECT_ID from GoogleService-Info.plist. If neither is available, ask the user whether to use the `firebase_get_project` tool to find a project id or provide one directly.",
        required: false,
      },
      {
        name: "app_id",
        description: "AppId for which the issues list should be fetched.",
        required: false,
      },
      {
        name: "prompt",
        description: "Any additional instructions you wish to provide about issue prioritization.",
        required: false,
      },
      {
        name: "issue_count",
        description: "The number of issues that should be returned in the final list. Defaults to 5.",
        required: false,
      },
    ],
    annotations: {
      title: "Prioritize Crashlytics Issues",
    },
  },
  async ({ project_id, app_id, prompt, issue_count }, { config, projectId, accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to prioritize issues from Crashlytics to return the top ${issue_count || 5} issues based on the criteria below.

Active user: ${accountEmail || "<NONE>"}
Active project: ${projectId || project_id || "<NONE>"}
Active app: ${app_id || "<NONE>"}

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
5. Use the \'crashlytics_list_top_versions\' tool to fetch the top versions for this app.
6. If the user instructions include statements about prioritization, use those instructions.
7. If the user instructions do not include statements about prioritization, then prioritize the returned issues using the following criteria:
  7a. The app versions for the issue include the most recent version of the app.
  7b. The number of users experiencing the issue across variants
  7c. The volume of crashes
8. Return the top ${issue_count || 5} issue ids, with a brief description of the issue in the following format: 
   Issue <issue id>: <issue description>
       Rationale: <the reason this issue was prioritized in the way it was>

The point of this command is to surface information but not solve the issues.
`.trim(),
        },
      },
    ];
  },
);
