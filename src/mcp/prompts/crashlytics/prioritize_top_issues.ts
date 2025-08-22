import { prompt } from "../../prompt";

export const prioritize_issues = prompt(
  {
    name: "prioritize_issues",
    omitPrefix: false,
    description: "Fetch and prioritize issues from Crashlytics.",
    arguments: [
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
        description:
          "The number of issues that should be returned in the final list. Defaults to 5.",
        required: false,
      },
    ],
    annotations: {
      title: "Prioritize Crashlytics Issues",
    },
  },
  async ({ app_id, prompt, issue_count }, { config, accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to prioritize issues from Crashlytics and return the top ${issue_count || 5} issues based on the criteria below.

Active user: ${accountEmail || "<NONE>"}
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
2. If there is no active app id, then do the following:
   2a. If this is an Android app, read the mobilesdk_app_id value specified in the google-services.json file
   2b. If this is an iOS app, read the GOOGLE_APP_ID from GoogleService-Info.plist file
   2a. If you can't find either of the above, ask the user for the app id.
3. Use the \`crashlytics_list_top_issues\` tool to fetch up to 20 issues.
5. Use the \'crashlytics_list_top_versions\' tool to fetch the top versions for this app.
6. If the user instructions include statements about prioritization, use those instructions.
7. If the user instructions do not include statements about prioritization, then prioritize the returned issues using the following criteria:
  7a. The app versions for the issue include the most recent version of the app.
  7b. The number of users experiencing the issue across variants
  7c. The volume of crashes
8. Return the top ${issue_count || 5} issue ids, with a brief description of the issue in the following format: 
   * Issue <issue id>
       * Description: <issue description>
       * Rationale: <the reason this issue was prioritized in the way it was>

The point of this command is to surface information only.
`.trim(),
        },
      },
    ];
  },
);
